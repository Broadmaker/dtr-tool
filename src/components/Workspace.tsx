import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Cloud,
  FileText,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plane,
  Plus,
  RefreshCw,
  School as SchoolIcon,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Badge, Btn, Field, SelectInput, TextInput } from './ui';
import WorkspaceDashboard, { type WorkspaceTab } from './WorkspaceDashboard';
import { monthName, prettyDate } from '../lib/dateUtils';
import {
  ApiError,
  createEmployee,
  createHoliday,
  createLeaveApplication,
  createLeaveType,
  createOfficialTravel,
  deleteHoliday,
  deleteOfficialTravel,
  getSession,
  listDtrPeriods,
  listEmployees,
  listHolidays,
  listLeaveApplications,
  listLeaveTypes,
  listMyMemberships,
  listOfficialTravels,
  listSchoolCatalog,
  listSchools,
  requestSchoolAccess,
  signIn,
  signOut,
  signUp,
  updateDtrPeriod,
  updateEmployee,
  updateLeaveApplication,
  updateOfficialTravel,
} from '../lib/api';
import type {
  CloudDtrPeriod,
  CloudEmployee,
  CloudHoliday,
  CloudLeaveApplication,
  CloudLeaveType,
  CloudMembership,
  CloudOfficialTravel,
  CloudSchool,
  CloudTravelStatus,
  CloudUser,
  SchoolCatalogEntry,
} from '../lib/api';
import { roleLabel, roleShortLabel } from '../lib/roles';

type Tab = WorkspaceTab;

type LocalHoliday = {
  date: string;
  description: string;
  type: 'Regular' | 'Special';
};

type Props = {
  onExit: () => void;
  month: number;
  year: number;
  hasDtr: boolean;
  onAdminChange: (value: boolean) => void;
  onOpenAdmin: () => void;
  onImportHolidays: (holidays: LocalHoliday[]) => void;
  onSaveDtr: (schoolId: string) => Promise<{
    saved: number;
    skipped: number;
    created: number;
    updated: number;
    inactive: number;
  }>;
};

const SCHOOL_KEY = 'dtr.cloud.school';
const SIDEBAR_KEY = 'dtr.workspace.sidebar';
const ADMIN_WORKSPACE_PREFIX = '#/workspace/admin';

function readAdminSchoolId(): string {
  const hash = window.location.hash.split('?')[0];
  if (!hash.startsWith(ADMIN_WORKSPACE_PREFIX)) return '';
  const id = hash
    .slice(ADMIN_WORKSPACE_PREFIX.length)
    .replace(/^\/+/, '')
    .split('/')[0];
  if (!id) return '';
  try {
    return decodeURIComponent(id);
  } catch {
    return '';
  }
}
const WRITE_ROLES = ['ao', 'system_admin'];
const APPROVER_ROLES = ['ao', 'system_admin'];

const TABS: { id: Tab; label: string; icon: typeof Users; description: string }[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    description: 'See attendance, leave, travel, and DTR activity at a glance.',
  },
  {
    id: 'roster',
    label: 'Roster',
    icon: Users,
    description: 'Keep employee records, plantilla details, and active status in one place.',
  },
  {
    id: 'holidays',
    label: 'Holidays',
    icon: CalendarDays,
    description: 'Record regular and special holidays for accurate DTR day classification.',
  },
  {
    id: 'leave',
    label: 'Leave',
    icon: FileText,
    description: 'Manage leave types and applications, then apply approved leave to DTRs.',
  },
  {
    id: 'travels',
    label: 'Official travels',
    icon: Plane,
    description: 'Track official travel orders, destinations, schedules, and status.',
  },
  {
    id: 'dtr',
    label: 'DTR',
    icon: Cloud,
    description: 'Review saved DTR periods, upload monthly day records, and monitor approval status.',
  },
];

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong.';
}

function employeeName(employee: CloudEmployee): string {
  return [employee.firstName, employee.middleName, employee.lastName, employee.suffix]
    .filter(Boolean)
    .join(' ');
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function statusTone(status: string): 'neutral' | 'brand' | 'success' | 'warn' {
  if (status === 'approved' || status === 'completed' || status === 'locked') return 'success';
  if (status === 'submitted' || status === 'reviewed') return 'brand';
  if (status === 'rejected' || status === 'cancelled') return 'warn';
  return 'neutral';
}

function weekdaysBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const first = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || last < first) return 0;

  let days = 0;
  for (const cursor = new Date(first); cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}

function travelDaysBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const first = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || last < first) return 0;
  return Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
}

function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-4 text-xs text-slate-500 dark:text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

function YearSelect({
  value,
  base,
  onChange,
}: {
  value: number;
  base: number;
  onChange: (year: number) => void;
}) {
  const options = useMemo(() => {
    const years = new Set<number>([base, value]);
    for (let year = base - 3; year <= base + 3; year += 1) years.add(year);
    return [...years].sort((a, b) => b - a);
  }, [base, value]);

  return (
    <SelectInput
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="!w-auto !py-1.5 !text-xs"
      aria-label="Year"
    >
      {options.map((year) => (
        <option key={year} value={year}>
          {year}
        </option>
      ))}
    </SelectInput>
  );
}

export default function Workspace({
  onExit,
  month,
  year,
  hasDtr,
  onAdminChange,
  onOpenAdmin,
  onImportHolidays,
  onSaveDtr,
}: Props) {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<CloudUser | null>(null);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [schools, setSchools] = useState<CloudSchool[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [catalog, setCatalog] = useState<SchoolCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [memberships, setMemberships] = useState<CloudMembership[]>([]);
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [joinBusy, setJoinBusy] = useState('');

  const [tab, setTab] = useState<Tab>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const [employees, setEmployees] = useState<CloudEmployee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [empFirst, setEmpFirst] = useState('');
  const [empMiddle, setEmpMiddle] = useState('');
  const [empLast, setEmpLast] = useState('');
  const [empSuffix, setEmpSuffix] = useState('');
  const [empNo, setEmpNo] = useState('');
  const [empPosition, setEmpPosition] = useState('');

  const [holidays, setHolidays] = useState<CloudHoliday[]>([]);
  const [holidaysLoading, setHolidaysLoading] = useState(false);
  const [holidayYear, setHolidayYear] = useState(year);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [holidayType, setHolidayType] = useState<CloudHoliday['type']>('regular');

  const [leaveTypes, setLeaveTypes] = useState<CloudLeaveType[]>([]);
  const [leaveApps, setLeaveApps] = useState<CloudLeaveApplication[]>([]);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveYear, setLeaveYear] = useState(year);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [leaveCode, setLeaveCode] = useState('');
  const [leaveName, setLeaveName] = useState('');
  const [appEmp, setAppEmp] = useState('');
  const [appType, setAppType] = useState('');
  const [appStart, setAppStart] = useState('');
  const [appEnd, setAppEnd] = useState('');
  const [appDays, setAppDays] = useState('1');
  const [appRemarks, setAppRemarks] = useState('');

  const [travels, setTravels] = useState<CloudOfficialTravel[]>([]);
  const [travelsLoading, setTravelsLoading] = useState(false);
  const [travelYear, setTravelYear] = useState(year);
  const [showTravelForm, setShowTravelForm] = useState(false);
  const [travelEmp, setTravelEmp] = useState('');
  const [travelRef, setTravelRef] = useState('');
  const [travelDestination, setTravelDestination] = useState('');
  const [travelPurpose, setTravelPurpose] = useState('');
  const [travelStart, setTravelStart] = useState('');
  const [travelEnd, setTravelEnd] = useState('');
  const [travelDays, setTravelDays] = useState('1');
  const [travelStatus, setTravelStatus] = useState<CloudTravelStatus>('planned');
  const [travelRemarks, setTravelRemarks] = useState('');

  const [periods, setPeriods] = useState<CloudDtrPeriod[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveResult, setSaveResult] = useState('');

  const school = schools.find((item) => item.id === schoolId) ?? null;
  const role = school?.role ?? 'guest';
  const canWrite = WRITE_ROLES.includes(role);
  const canApprove = APPROVER_ROLES.includes(role);
  const showJoin = joinOpen || (!isSystemAdmin && schools.length === 0);
  const membershipBySchool = useMemo(
    () => new Map(memberships.map((membership) => [membership.schoolId, membership])),
    [memberships],
  );
  const onboardingMemberships = memberships.filter(
    (membership) => membership.status !== 'active',
  );
  const filteredCatalog = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) return catalog;
    return catalog.filter((entry) =>
      [entry.name, entry.schoolCode ?? '', entry.division ?? '', entry.region ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [catalog, catalogSearch]);
  const activeTab = TABS.find((item) => item.id === tab) ?? TABS[0];
  const adminWorkspace = window.location.hash.startsWith(ADMIN_WORKSPACE_PREFIX);
  const adminSchoolId = adminWorkspace ? readAdminSchoolId() : '';

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      // Storage can be unavailable in private mode.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onHash = () => {
      if (!isSystemAdmin) return;
      if (
        !window.location.hash.startsWith(ADMIN_WORKSPACE_PREFIX) ||
        !readAdminSchoolId()
      ) {
        onOpenAdmin();
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [isSystemAdmin, onOpenAdmin]);

  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest('[data-account-menu]')) {
        setAccountOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [accountOpen]);

  const fail = useCallback(
    (cause: unknown) => {
      if (cause instanceof ApiError && cause.status === 401 && user) {
        setUser(null);
        setIsSystemAdmin(false);
        onAdminChange(false);
        setSchools([]);
        setSchoolId('');
        setEmployees([]);
        setHolidays([]);
        setPeriods([]);
        setLeaveTypes([]);
        setLeaveApps([]);
        setTravels([]);
        setMemberships([]);
        setCatalog([]);
        setError('Your session expired. Sign in again.');
        return;
      }
      setError(errorText(cause));
    },
    [user, onAdminChange],
  );

  useEffect(() => {
    let active = true;
    getSession()
      .then((session) => {
        if (!active) return;
        if (session?.isSystemAdmin) {
          setIsSystemAdmin(true);
          onAdminChange(true);
          if (!adminWorkspace || !adminSchoolId) {
            onOpenAdmin();
            return;
          }
        }
        setUser(session?.user ?? null);
        setIsSystemAdmin(session?.isSystemAdmin ?? false);
        onAdminChange(session?.isSystemAdmin ?? false);
      })
      .catch(() => {
        if (active) {
          setError('Could not verify your session. Check that the API is running and try again.');
        }
      })
      .finally(() => {
        if (active) setBooting(false);
      });
    return () => {
      active = false;
    };
  }, [onAdminChange, onOpenAdmin, adminWorkspace, adminSchoolId]);

  const loadSchools = useCallback(async (): Promise<CloudSchool[]> => {
    setLoadingSchools(true);
    try {
      const list = await listSchools();
      setSchools(list);
      const targetAdminSchoolId = isSystemAdmin ? adminSchoolId : '';
      if (targetAdminSchoolId && !list.some((item) => item.id === targetAdminSchoolId)) {
        onOpenAdmin();
        return list;
      }
      setSchoolId((current) => {
        if (targetAdminSchoolId) return targetAdminSchoolId;
        if (current && list.some((item) => item.id === current)) return current;
        let stored = '';
        try {
          stored = localStorage.getItem(SCHOOL_KEY) ?? '';
        } catch {
          stored = '';
        }
        if (stored && list.some((item) => item.id === stored)) return stored;
        return list[0]?.id ?? '';
      });
      return list;
    } catch (cause) {
      fail(cause);
      return [];
    } finally {
      setLoadingSchools(false);
    }
  }, [fail, isSystemAdmin, adminSchoolId, onOpenAdmin]);

  const loadOnboarding = useCallback(async () => {
    setMembershipsLoading(true);
    setCatalogLoading(true);
    try {
      const [nextMemberships, nextCatalog] = await Promise.all([
        listMyMemberships(),
        listSchoolCatalog(),
      ]);
      setMemberships(nextMemberships);
      setCatalog(nextCatalog);
    } catch (cause) {
      fail(cause);
    } finally {
      setMembershipsLoading(false);
      setCatalogLoading(false);
    }
  }, [fail]);

  useEffect(() => {
    if (!user) return;
    void loadSchools();
    void loadOnboarding();
  }, [user, loadSchools, loadOnboarding]);

  const loadEmployees = useCallback(
    async (id: string) => {
      setEmployeesLoading(true);
      try {
        setEmployees(await listEmployees(id, { includeInactive: true }));
      } catch (cause) {
        fail(cause);
      } finally {
        setEmployeesLoading(false);
      }
    },
    [fail],
  );

  useEffect(() => {
    if (!user || !schoolId) return;
    if (tab === 'dashboard' || tab === 'roster' || tab === 'leave' || tab === 'travels') {
      void loadEmployees(schoolId);
    }
  }, [user, schoolId, tab, loadEmployees]);

  const loadHolidays = useCallback(
    async (id: string, selectedYear: number) => {
      setHolidaysLoading(true);
      try {
        setHolidays(await listHolidays(id, selectedYear));
      } catch (cause) {
        fail(cause);
      } finally {
        setHolidaysLoading(false);
      }
    },
    [fail],
  );

  useEffect(() => {
    if (!user || !schoolId) return;
    if (tab === 'dashboard') void loadHolidays(schoolId, year);
    else if (tab === 'holidays') void loadHolidays(schoolId, holidayYear);
  }, [user, schoolId, tab, holidayYear, year, loadHolidays]);

  const loadLeave = useCallback(
    async (id: string, selectedYear: number) => {
      setLeaveLoading(true);
      try {
        const [types, apps] = await Promise.all([
          listLeaveTypes(id),
          listLeaveApplications(id, { year: selectedYear }),
        ]);
        setLeaveTypes(types);
        setLeaveApps(apps);
      } catch (cause) {
        fail(cause);
      } finally {
        setLeaveLoading(false);
      }
    },
    [fail],
  );

  useEffect(() => {
    if (!user || !schoolId) return;
    if (tab === 'dashboard') void loadLeave(schoolId, year);
    else if (tab === 'leave') void loadLeave(schoolId, leaveYear);
  }, [user, schoolId, tab, leaveYear, year, loadLeave]);

  const loadTravels = useCallback(
    async (id: string, selectedYear: number) => {
      setTravelsLoading(true);
      try {
        setTravels(await listOfficialTravels(id, { year: selectedYear }));
      } catch (cause) {
        fail(cause);
      } finally {
        setTravelsLoading(false);
      }
    },
    [fail],
  );

  useEffect(() => {
    if (!user || !schoolId) return;
    if (tab === 'dashboard') void loadTravels(schoolId, year);
    else if (tab === 'travels') void loadTravels(schoolId, travelYear);
  }, [user, schoolId, tab, travelYear, year, loadTravels]);

  const loadPeriods = useCallback(
    async (id: string) => {
      setPeriodsLoading(true);
      try {
        setPeriods(await listDtrPeriods(id, { year, month }));
      } catch (cause) {
        fail(cause);
      } finally {
        setPeriodsLoading(false);
      }
    },
    [fail, year, month],
  );

  useEffect(() => {
    if (!user || !schoolId) return;
    if (tab === 'dashboard' || tab === 'dtr') void loadPeriods(schoolId);
  }, [user, schoolId, tab, loadPeriods]);

  const filteredEmployees = useMemo(() => {
    const query = empSearch.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee) =>
      [employeeName(employee), employee.employeeNo ?? '', employee.position ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [employees, empSearch]);

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.isActive),
    [employees],
  );

  const selectedAppEmp =
    appEmp && activeEmployees.some((employee) => employee.id === appEmp)
      ? appEmp
      : (activeEmployees[0]?.id ?? '');
  const selectedAppType =
    appType && leaveTypes.some((type) => type.id === appType)
      ? appType
      : (leaveTypes[0]?.id ?? '');
  const selectedTravelEmp =
    travelEmp && activeEmployees.some((employee) => employee.id === travelEmp)
      ? travelEmp
      : (activeEmployees[0]?.id ?? '');

  const chooseSchool = (id: string) => {
    setSchoolId(id);
    setTab('dashboard');
    setJoinOpen(false);
    setError('');
    setNotice('');
    setEmployees([]);
    setHolidays([]);
    setPeriods([]);
    setLeaveTypes([]);
    setLeaveApps([]);
    setTravels([]);
    setShowEmpForm(false);
    setEmpFirst('');
    setEmpLast('');
    setEmpNo('');
    setEmpPosition('');
    setShowTypeForm(false);
    setLeaveCode('');
    setLeaveName('');
    setAppEmp('');
    setAppType('');
    setAppStart('');
    setAppEnd('');
    setAppDays('1');
    setAppRemarks('');
    setShowTravelForm(false);
    setTravelEmp('');
    setTravelRef('');
    setTravelDestination('');
    setTravelPurpose('');
    setTravelStart('');
    setTravelEnd('');
    setTravelDays('1');
    setTravelStatus('planned');
    setTravelRemarks('');
    try {
      localStorage.setItem(SCHOOL_KEY, id);
    } catch {
      // Storage can be unavailable in private mode.
    }
  };

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result =
        authMode === 'signin'
          ? await signIn(email.trim(), password)
          : await signUp(name.trim(), email.trim(), password);
      const session = await getSession();
      if (session?.isSystemAdmin) {
        setIsSystemAdmin(true);
        onAdminChange(true);
        setPassword('');
        if (!adminWorkspace || !adminSchoolId) {
          onOpenAdmin();
          return;
        }
      }
      setUser(session?.user ?? result.user);
      setIsSystemAdmin(session?.isSystemAdmin ?? false);
      onAdminChange(session?.isSystemAdmin ?? false);
      setPassword('');
      setName('');
      setNotice(authMode === 'signin' ? `Signed in as ${result.user.name}` : 'Account created.');
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    await signOut().catch(() => undefined);
    setUser(null);
    setIsSystemAdmin(false);
    onAdminChange(false);
    setSchools([]);
    setSchoolId('');
    setEmployees([]);
    setHolidays([]);
    setPeriods([]);
    setLeaveTypes([]);
    setLeaveApps([]);
    setTravels([]);
    setMemberships([]);
    setCatalog([]);
    setJoinOpen(false);
    setError('');
    setNotice('');
    try {
      localStorage.removeItem(SCHOOL_KEY);
    } catch {
      // Storage can be unavailable in private mode.
    }
    setBusy(false);
  };

  const requestAccess = async (entry: SchoolCatalogEntry) => {
    setJoinBusy(entry.id);
    setError('');
    setNotice('');
    try {
      const membership = await requestSchoolAccess(entry.id);
      setMemberships((current) => [
        ...current.filter((item) => item.schoolId !== membership.schoolId),
        membership,
      ]);
      setNotice(`Requested access to ${entry.name}. A super admin will review it.`);
    } catch (cause) {
      fail(cause);
    } finally {
      setJoinBusy('');
    }
  };

  const refreshAccess = async () => {
    setMembershipsLoading(true);
    setError('');
    setNotice('');
    try {
      const [list, nextMemberships] = await Promise.all([
        loadSchools(),
        listMyMemberships(),
      ]);
      setMemberships(nextMemberships);
      if (list.length > 0) {
        setJoinOpen(false);
        setNotice('School access granted.');
      } else {
        setNotice('Still waiting for a super admin to approve your request.');
      }
    } catch (cause) {
      fail(cause);
    } finally {
      setMembershipsLoading(false);
    }
  };

  const resetEmpForm = () => {
    setEditingEmpId(null);
    setEmpFirst('');
    setEmpMiddle('');
    setEmpLast('');
    setEmpSuffix('');
    setEmpNo('');
    setEmpPosition('');
    setShowEmpForm(false);
  };

  const openAddEmployee = () => {
    if (showEmpForm) {
      resetEmpForm();
      return;
    }
    setEditingEmpId(null);
    setEmpFirst('');
    setEmpMiddle('');
    setEmpLast('');
    setEmpSuffix('');
    setEmpNo('');
    setEmpPosition('');
    setShowEmpForm(true);
  };

  const startEditEmployee = (employee: CloudEmployee) => {
    setEditingEmpId(employee.id);
    setEmpFirst(employee.firstName);
    setEmpMiddle(employee.middleName ?? '');
    setEmpLast(employee.lastName);
    setEmpSuffix(employee.suffix ?? '');
    setEmpNo(employee.employeeNo ?? '');
    setEmpPosition(employee.position ?? '');
    setShowEmpForm(true);
    setError('');
    setNotice('');
  };

  const submitEmployee = async (event: FormEvent) => {
    event.preventDefault();
    if (!schoolId) return;
    if (!empFirst.trim() || !empLast.trim()) {
      setError('First and last name are required.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const input = {
        firstName: empFirst.trim(),
        lastName: empLast.trim(),
        middleName: empMiddle.trim() || null,
        suffix: empSuffix.trim() || null,
        employeeNo: empNo.trim() || null,
        position: empPosition.trim() || null,
      };
      if (editingEmpId) {
        await updateEmployee(schoolId, editingEmpId, input);
        setNotice('Employee updated.');
      } else {
        await createEmployee(schoolId, input);
        setNotice('Employee added.');
      }
      resetEmpForm();
      await loadEmployees(schoolId);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const toggleEmployee = async (employee: CloudEmployee) => {
    if (!schoolId) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await updateEmployee(schoolId, employee.id, { isActive: !employee.isActive });
      await loadEmployees(schoolId);
      setNotice(employee.isActive ? 'Employee deactivated.' : 'Employee reactivated.');
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const submitHoliday = async (event: FormEvent) => {
    event.preventDefault();
    if (!schoolId) return;
    if (!holidayDate || !holidayName.trim()) {
      setError('Date and holiday name are required.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await createHoliday(schoolId, {
        holidayDate,
        name: holidayName.trim(),
        type: holidayType,
      });
      setHolidayDate('');
      setHolidayName('');
      await loadHolidays(schoolId, holidayYear);
      setNotice('Holiday added.');
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const removeHoliday = async (holiday: CloudHoliday) => {
    if (!schoolId || holiday.schoolId === null) return;
    if (!window.confirm(`Delete ${holiday.name}?`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await deleteHoliday(schoolId, holiday.id);
      await loadHolidays(schoolId, holidayYear);
      setNotice('Holiday deleted.');
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const importHolidays = () => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const picked = holidays
      .filter((holiday) => holiday.holidayDate.startsWith(prefix))
      .map<LocalHoliday>((holiday) => ({
        date: holiday.holidayDate,
        description: holiday.name,
        type: holiday.type === 'regular' ? 'Regular' : 'Special',
      }));
    if (!picked.length) {
      setError(`No holidays found for ${monthName(month)} ${year}.`);
      return;
    }
    onImportHolidays(picked);
    onExit();
  };

  const submitLeaveType = async (event: FormEvent) => {
    event.preventDefault();
    if (!schoolId) return;
    if (!leaveCode.trim() || !leaveName.trim()) {
      setError('Code and name are required.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await createLeaveType(schoolId, {
        code: leaveCode.trim(),
        name: leaveName.trim(),
      });
      setLeaveCode('');
      setLeaveName('');
      setShowTypeForm(false);
      await loadLeave(schoolId, leaveYear);
      setNotice('Leave type added.');
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const setStart = (value: string) => {
    setAppStart(value);
    const days = weekdaysBetween(value, appEnd);
    if (days) setAppDays(String(days));
  };

  const setEnd = (value: string) => {
    setAppEnd(value);
    const days = weekdaysBetween(appStart, value);
    if (days) setAppDays(String(days));
  };

  const submitLeaveApplication = async (event: FormEvent) => {
    event.preventDefault();
    if (!schoolId) return;
    if (!selectedAppEmp || !selectedAppType || !appStart || !appEnd) {
      setError('Choose an employee, leave type, and dates.');
      return;
    }
    const days = Number(appDays);
    if (!Number.isFinite(days) || days <= 0) {
      setError('Days must be a positive number.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await createLeaveApplication(schoolId, {
        employeeId: selectedAppEmp,
        leaveTypeId: selectedAppType,
        startDate: appStart,
        endDate: appEnd,
        days,
        remarks: appRemarks.trim() || null,
        status: 'submitted',
      });
      setAppStart('');
      setAppEnd('');
      setAppDays('1');
      setAppRemarks('');
      await loadLeave(schoolId, leaveYear);
      setNotice('Leave filed.');
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const decideLeave = async (
    application: CloudLeaveApplication,
    status: 'approved' | 'rejected',
  ) => {
    if (!schoolId) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await updateLeaveApplication(schoolId, application.id, { status });
      await loadLeave(schoolId, leaveYear);
      setNotice(`Leave ${status}.`);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const setTravelStartDate = (value: string) => {
    setTravelStart(value);
    const days = travelDaysBetween(value, travelEnd);
    if (days) setTravelDays(String(days));
  };

  const setTravelEndDate = (value: string) => {
    setTravelEnd(value);
    const days = travelDaysBetween(travelStart, value);
    if (days) setTravelDays(String(days));
  };

  const submitTravel = async (event: FormEvent) => {
    event.preventDefault();
    if (!schoolId) return;
    if (!selectedTravelEmp || !travelDestination.trim() || !travelStart || !travelEnd) {
      setError('Choose an employee, destination, and travel dates.');
      return;
    }
    const days = Number(travelDays);
    if (!Number.isFinite(days) || days <= 0) {
      setError('Days must be a positive number.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await createOfficialTravel(schoolId, {
        employeeId: selectedTravelEmp,
        referenceNo: travelRef.trim() || null,
        destination: travelDestination.trim(),
        purpose: travelPurpose.trim() || null,
        startDate: travelStart,
        endDate: travelEnd,
        days,
        status: travelStatus,
        remarks: travelRemarks.trim() || null,
      });
      const nextYear = Number(travelStart.slice(0, 4));
      setTravelYear(nextYear);
      setTravelEmp('');
      setTravelRef('');
      setTravelDestination('');
      setTravelPurpose('');
      setTravelStart('');
      setTravelEnd('');
      setTravelDays('1');
      setTravelStatus('planned');
      setTravelRemarks('');
      setShowTravelForm(false);
      await loadTravels(schoolId, nextYear);
      setNotice('Official travel recorded.');
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const changeTravelStatus = async (
    travel: CloudOfficialTravel,
    status: CloudTravelStatus,
  ) => {
    if (!schoolId) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await updateOfficialTravel(schoolId, travel.id, { status });
      await loadTravels(schoolId, travelYear);
      setNotice(`Travel marked ${status}.`);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const removeTravel = async (travel: CloudOfficialTravel) => {
    if (!schoolId) return;
    if (!window.confirm(`Delete the travel record for ${travel.employeeName}?`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await deleteOfficialTravel(schoolId, travel.id);
      await loadTravels(schoolId, travelYear);
      setNotice('Official travel deleted.');
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const saveDtr = async () => {
    if (!schoolId) return;
    setSaveBusy(true);
    setError('');
    setNotice('');
    setSaveResult('');
    try {
      const result = await onSaveDtr(schoolId);
      const created = result.created
        ? ` Added ${result.created} employee${result.created === 1 ? '' : 's'} to the roster.`
        : '';
      const updated = result.updated
        ? ` Updated ${result.updated} roster record${result.updated === 1 ? '' : 's'}.`
        : '';
      const inactive = result.inactive
        ? ` Skipped ${result.inactive} inactive employee${result.inactive === 1 ? '' : 's'} — reactivate them in the roster to save their DTR.`
        : '';
      const skipped = result.skipped
        ? ` Skipped ${result.skipped} approved or locked period${result.skipped === 1 ? '' : 's'}.`
        : '';
      setSaveResult(
        `Saved ${result.saved} DTR${result.saved === 1 ? '' : 's'}.${updated}${created}${inactive}${skipped}`,
      );
      await loadPeriods(schoolId);
    } catch (cause) {
      fail(cause);
    } finally {
      setSaveBusy(false);
    }
  };

  const changePeriod = async (
    period: CloudDtrPeriod,
    status: CloudDtrPeriod['status'],
  ) => {
    if (!schoolId) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await updateDtrPeriod(schoolId, period.id, status);
      await loadPeriods(schoolId);
      setNotice(`Period marked ${status}.`);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const joinPanel = (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold">Join a school</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
          Choose your school from the official list. A super admin will approve your
          request before the workspace opens.
        </p>
      </div>

      {onboardingMemberships.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <h4 className="text-sm font-semibold">Your requests</h4>
            <Btn
              size="xs"
              variant="soft"
              className="ml-auto"
              onClick={() => void refreshAccess()}
              disabled={membershipsLoading}
            >
              <RefreshCw className={`h-3 w-3 ${membershipsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Btn>
          </div>
          <div className="space-y-1.5">
            {onboardingMemberships.map((membership) => (
              <div
                key={membership.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{membership.schoolName}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {[membership.schoolCode, roleLabel(membership.role)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <Badge tone={membership.status === 'pending' ? 'brand' : 'warn'}>
                  {membership.status}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold">Official school list</h4>
          {catalogLoading && <Loading label="Loading schools…" />}
        </div>
        <TextInput
          value={catalogSearch}
          onChange={(event) => setCatalogSearch(event.target.value)}
          placeholder="Search school name, code, division, or region…"
          className="mb-2"
        />
        {catalogLoading ? null : filteredCatalog.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
            {catalog.length === 0
              ? 'No schools have been added yet. Contact the super admin.'
              : 'No schools match that search.'}
          </p>
        ) : (
          <>
            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {filteredCatalog.slice(0, 40).map((entry) => {
                const membership = membershipBySchool.get(entry.id);
                const isMember = membership?.status === 'active';
                const isPending = membership?.status === 'pending';
                return (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center gap-2 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{entry.name}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {[entry.schoolCode, entry.division, entry.region]
                          .filter(Boolean)
                          .join(' · ') || 'No details'}
                      </p>
                    </div>
                    <Btn
                      size="xs"
                      variant={isMember || isPending ? 'subtle' : 'primary'}
                      onClick={() => void requestAccess(entry)}
                      disabled={isMember || isPending || joinBusy === entry.id}
                    >
                      {joinBusy === entry.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : isMember ? (
                        'Member'
                      ) : isPending ? (
                        'Pending'
                      ) : membership ? (
                        'Request again'
                      ) : (
                        'Request access'
                      )}
                    </Btn>
                  </div>
                );
              })}
            </div>
            {filteredCatalog.length > 40 && (
              <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">
                Showing 40 of {filteredCatalog.length} schools. Refine your search to see
                more.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );

  const renderSidebar = (collapsed: boolean, mobile = false) => {
    const iconOnly = collapsed && !mobile;
    const accountName = user?.name ?? 'Account';
    const accountEmail = user?.email ?? '';
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className={`flex items-center gap-2 ${iconOnly ? 'justify-center' : 'justify-between'}`}>
          <div className={`flex min-w-0 items-center gap-2.5 ${iconOnly ? '' : 'px-2'}`}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
              <Cloud className="h-4 w-4" />
            </span>
            {!iconOnly && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold tracking-tight">
                  DTR Workspace
                </span>
                <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                  Attendance operations
                </span>
              </span>
            )}
          </div>
          {mobile && (
            <Btn
              variant="subtle"
              size="sm"
              className="h-9 w-9 shrink-0 !px-0"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </Btn>
          )}
        </div>

        {school ? (
          iconOnly ? (
            <div
              title={school.name}
              className="mt-5 grid h-10 w-10 place-items-center self-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
            >
              <Building2 className="h-4 w-4" />
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                School
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold">{school.name}</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <Badge tone="brand">{roleLabel(school.role)}</Badge>
                {school.schoolCode && (
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {school.schoolCode}
                  </span>
                )}
              </div>
            </div>
          )
        ) : (
          !iconOnly && (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-[11px] leading-relaxed text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No school selected yet. Join or create a school workspace to unlock pages.
            </div>
          )
        )}

        <nav
          className={`${iconOnly ? 'mt-4 flex flex-col items-center gap-1' : 'mt-5 space-y-1'}`}
          aria-label="Workspace pages"
        >
          {!iconOnly && (
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Pages
            </p>
          )}
          {schoolId && !showJoin ? (
            TABS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={iconOnly ? item.label : undefined}
                  aria-label={iconOnly ? item.label : undefined}
                  onClick={() => {
                    setTab(item.id);
                    setMobileNavOpen(false);
                    setError('');
                    setNotice('');
                  }}
                  className={`flex items-center gap-2.5 rounded-xl text-sm font-medium transition-colors ${
                    iconOnly ? 'h-10 w-10 justify-center' : 'w-full px-2.5 py-2'
                  } ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!iconOnly && <span className="truncate">{item.label}</span>}
                </button>
              );
            })
          ) : iconOnly ? (
            <div
              title="No school selected"
              className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 dark:text-slate-500"
            >
              <SchoolIcon className="h-4 w-4" />
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 px-3 py-3 text-[11px] leading-relaxed text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Join or create a school workspace to unlock roster, holiday, leave, and DTR
              pages.
            </p>
          )}
        </nav>

        <div
          className={`mt-auto ${
            iconOnly
              ? 'flex flex-col items-center gap-1 border-t border-slate-200 pt-3 dark:border-slate-800'
              : 'space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800'
          }`}
        >
          {iconOnly ? (
            <>
              <div
                title={`${accountName} · ${accountEmail}`}
                className="grid h-10 w-10 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-white dark:text-slate-900"
              >
                {initials(accountName)}
              </div>
              {isSystemAdmin && (
                <Btn
                  variant="subtle"
                  size="sm"
                  className="h-10 w-10 !px-0"
                  title="Admin console"
                  aria-label="Admin console"
                  onClick={onOpenAdmin}
                >
                  <ShieldCheck className="h-4 w-4" />
                </Btn>
              )}
              <Btn
                variant="subtle"
                size="sm"
                className="h-10 w-10 !px-0"
                title="Sign out"
                aria-label="Sign out"
                onClick={() => void logout()}
                disabled={busy}
              >
                <LogOut className="h-4 w-4" />
              </Btn>
            </>
          ) : (
            <>
              <div className="px-2">
                <p className="truncate text-sm font-semibold">{accountName}</p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {accountEmail}
                </p>
                {isSystemAdmin && (
                  <span className="mt-1 inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200">
                    super admin
                  </span>
                )}
              </div>
              {isSystemAdmin && (
                <Btn variant="soft" size="sm" className="w-full" onClick={onOpenAdmin}>
                  <ShieldCheck className="h-3.5 w-3.5" /> Admin console
                </Btn>
              )}
              <Btn
                variant="subtle"
                size="sm"
                className="w-full"
                onClick={() => void logout()}
                disabled={busy}
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </Btn>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {booting ? (
        <div className="grid min-h-dvh place-items-center px-4">
          <Loading label="Checking session…" />
        </div>
      ) : !user ? (
        <div className="grid min-h-dvh place-items-center px-4 py-10">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                <Cloud className="h-5 w-5" />
              </div>
              <h1 className="mt-4 text-xl font-semibold tracking-tight">Cloud workspace</h1>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
                Keep rosters, holidays, leave, and approved DTRs in sync across devices.
                Your attendance files stay on this device unless you explicitly save a DTR.
              </p>
            </div>

            <div className="mt-5 flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950">
              {(['signin', 'signup'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setAuthMode(mode);
                    setError('');
                  }}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    authMode === mode
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <form onSubmit={submitAuth} className="mt-4 space-y-3">
              {authMode === 'signup' && (
                <Field label="Name">
                  <TextInput
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    required
                  />
                </Field>
              )}
              <Field label="Email">
                <TextInput
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </Field>
              <Field label="Password" hint="at least 8 characters">
                <TextInput
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                  minLength={8}
                  required
                />
              </Field>
              {error && (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                  {error}
                </p>
              )}
              <Btn type="submit" variant="primary" className="w-full" disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : authMode === 'signin' ? (
                  'Sign in'
                ) : (
                  'Create account'
                )}
              </Btn>
            </form>

            <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              No account is required for the DTR generator. Return to the tool to keep
              everything local.
            </p>
            <Btn variant="ghost" className="mt-3 w-full" onClick={onExit}>
              <ArrowLeft className="h-4 w-4" /> Back to DTR Tool
            </Btn>
          </div>
        </div>
      ) : (
        <div className="min-h-dvh">
          <aside
            aria-label="Workspace sidebar"
            className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200 bg-white py-5 transition-[width,padding] duration-300 dark:border-slate-800 dark:bg-slate-900 lg:flex ${
              sidebarCollapsed ? 'w-[76px] px-2' : 'w-64 px-4'
            }`}
          >
            {renderSidebar(sidebarCollapsed)}
          </aside>

          {mobileNavOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div
                className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
                onClick={() => setMobileNavOpen(false)}
                aria-hidden
              />
              <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white px-4 py-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                {renderSidebar(false, true)}
              </aside>
            </div>
          )}

          <div
            className={`flex min-h-dvh flex-col transition-[padding] duration-300 ${
              sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-64'
            }`}
          >
            <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/75">
              <div className="flex h-16 items-center gap-2 px-4 sm:px-6 lg:px-8">
                <Btn
                  variant="subtle"
                  size="sm"
                  className="h-9 w-9 !px-0 lg:!hidden"
                  onClick={() => setMobileNavOpen(true)}
                  aria-label="Open navigation"
                >
                  <Menu className="h-5 w-5" />
                </Btn>
                <Btn
                  variant="subtle"
                  size="sm"
                  className="!hidden h-9 w-9 !px-0 lg:!inline-flex"
                  onClick={() => setSidebarCollapsed((value) => !value)}
                  aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {sidebarCollapsed ? (
                    <PanelLeftOpen className="h-4 w-4" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4" />
                  )}
                </Btn>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    DTR Workspace
                  </p>
                  <p className="truncate text-sm font-semibold tracking-tight">{activeTab.label}</p>
                </div>

                <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300 md:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Local-first
                </span>

                {isSystemAdmin && (
                  <Btn
                    variant="ghost"
                    size="sm"
                    onClick={onOpenAdmin}
                    className="hidden sm:inline-flex"
                    title="Open admin console"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Admin</span>
                  </Btn>
                )}

                <div className="relative" data-account-menu>
                  <button
                    type="button"
                    onClick={() => setAccountOpen((value) => !value)}
                    aria-expanded={accountOpen}
                    aria-haspopup="menu"
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-left shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-900 text-[11px] font-semibold text-white dark:bg-white dark:text-slate-900">
                      {initials(user.name)}
                    </span>
                    <span className="hidden min-w-0 sm:block">
                      <span className="block max-w-[140px] truncate text-xs font-semibold">
                        {user.name}
                      </span>
                      <span className="block max-w-[140px] truncate text-[10px] text-slate-500 dark:text-slate-400">
                        {school ? roleShortLabel(school.role) : user.email}
                      </span>
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                        accountOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {accountOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
                    >
                      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold">{user.name}</p>
                          {isSystemAdmin && <Badge tone="brand">super admin</Badge>}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {user.email}
                        </p>
                      </div>
                      <div className="p-1.5">
                        {isSystemAdmin && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setAccountOpen(false);
                              onOpenAdmin();
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <ShieldCheck className="h-4 w-4" /> Admin console
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setAccountOpen(false);
                            onExit();
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <ArrowLeft className="h-4 w-4" /> Exit workspace
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setAccountOpen(false);
                            void logout();
                          }}
                          disabled={busy}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <LogOut className="h-4 w-4" /> Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </header>

            <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              <section className="relative overflow-hidden rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-600 via-brand-700 to-slate-900 p-5 text-white shadow-xl sm:p-7">
                <div
                  className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl"
                  aria-hidden
                />
                <div className="relative">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-white/80">
                    <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1">
                      School workspace
                    </span>
                    <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1">
                      {monthName(month)} {year}
                    </span>
                    <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-emerald-100">
                      Local-first
                    </span>
                  </div>

                  <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0">
                      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                        {activeTab.label}
                      </h1>
                      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/75">
                        {activeTab.description}
                      </p>
                    </div>
                    {isSystemAdmin && (
                      <div className="flex flex-wrap gap-2">
                        <Btn variant="soft" size="sm" onClick={onOpenAdmin}>
                          <ShieldCheck className="h-3.5 w-3.5" /> Admin console
                        </Btn>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur sm:flex-row sm:items-end">
                    {schools.length > 0 ? (
                      <>
                        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">
                            School
                          </span>
                          <SelectInput
                            value={schoolId}
                            onChange={(event) => {
                              chooseSchool(event.target.value);
                              setMobileNavOpen(false);
                            }}
                            className="min-w-[220px] border-white/20 bg-white text-slate-900"
                          >
                            {schools.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </SelectInput>
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          {school && (
                            <span className="inline-flex h-9 items-center rounded-xl border border-white/20 bg-white/10 px-3 text-[11px] font-semibold uppercase tracking-wide text-white/80">
                              {roleShortLabel(school.role)}
                            </span>
                          )}
                          {school?.schoolCode && (
                            <span className="inline-flex h-9 items-center rounded-xl border border-white/20 bg-white/10 px-3 text-[11px] font-medium text-white/70">
                              School ID {school.schoolCode}
                            </span>
                          )}
                        </div>
                        {!isSystemAdmin && (
                          <div className="flex flex-wrap gap-2 sm:ml-auto">
                            <Btn
                              size="sm"
                              variant="ghost"
                              className="!border-white/20 !bg-white/10 !text-white hover:!bg-white/20"
                              onClick={() => {
                                setJoinOpen(true);
                                setError('');
                                setNotice('');
                                setMobileNavOpen(false);
                              }}
                            >
                              <SchoolIcon className="h-3.5 w-3.5" /> Join school
                            </Btn>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-1 flex-wrap items-center gap-3">
                        <SchoolIcon className="h-5 w-5 text-white/70" />
                        <p className="text-sm text-white/80">
                          {isSystemAdmin
                            ? 'No school workspace selected'
                            : 'Join your school workspace'}
                        </p>
                        {!isSystemAdmin && (
                          <Btn
                            size="sm"
                            variant="ghost"
                            className="!border-white/20 !bg-white/10 !text-white hover:!bg-white/20 sm:ml-auto"
                            onClick={() => {
                              setJoinOpen(true);
                              setError('');
                              setNotice('');
                              setMobileNavOpen(false);
                            }}
                          >
                            <SchoolIcon className="h-3.5 w-3.5" /> Join school
                          </Btn>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>

            {(error || notice) && (
              <div className="mt-4 space-y-2">
                {error && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                    {error}
                  </p>
                )}
                {notice && (
                  <p role="status" className={`rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200 ${error ? 'mt-1.5' : ''}`}>
                    {notice}
                  </p>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-4">
              {loadingSchools && schools.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white px-5 py-10 dark:border-slate-800 dark:bg-slate-900">
                  <Loading label="Loading schools…" />
                </div>
              ) : (
                <>
                  {showJoin ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
                      {schools.length > 0 && (
                        <Btn
                          size="xs"
                          variant="ghost"
                          className="mb-3"
                          onClick={() => setJoinOpen(false)}
                        >
                          Back to workspace
                        </Btn>
                      )}
                      {joinPanel}
                    </div>
                  ) : !schoolId ? (
                    <div className="rounded-xl border border-dashed border-slate-300 px-5 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      {isSystemAdmin
                        ? 'Open a school workspace from the Admin Console.'
                        : 'A school workspace keeps the roster, holidays, and DTRs together.'}
                    </div>
                  ) : (
                    <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                        {tab === 'dashboard' && (
                          <WorkspaceDashboard
                            schoolName={school?.name ?? 'School workspace'}
                            role={role}
                            month={month}
                            year={year}
                            employees={employees}
                            holidays={holidays}
                            leaveApps={leaveApps}
                            periods={periods}
                            travels={travels}
                            loading={
                              employeesLoading ||
                              holidaysLoading ||
                              leaveLoading ||
                              periodsLoading ||
                              travelsLoading
                            }
                            canWrite={canWrite}
                            onTabChange={(next) => {
                              setTab(next);
                              setError('');
                              setNotice('');
                            }}
                          />
                        )}

                        {tab === 'roster' && (
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <TextInput
                                value={empSearch}
                                onChange={(event) => setEmpSearch(event.target.value)}
                                placeholder="Search name, employee no., position…"
                                className="min-w-[180px] flex-1"
                              />
                              <Btn
                                size="sm"
                                variant="primary"
                                onClick={openAddEmployee}
                                disabled={!canWrite}
                              >
                                <Plus className="h-3.5 w-3.5" /> Add employee
                              </Btn>
                              <Btn
                                size="sm"
                                variant="soft"
                                onClick={() => void loadEmployees(schoolId)}
                                disabled={employeesLoading}
                              >
                                <RefreshCw className={`h-3.5 w-3.5 ${employeesLoading ? 'animate-spin' : ''}`} />
                              </Btn>
                            </div>

                            {showEmpForm && canWrite && (
                              <form
                                onSubmit={submitEmployee}
                                className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40 sm:grid-cols-2"
                              >
                                <Field label="First name">
                                  <TextInput
                                    value={empFirst}
                                    onChange={(event) => setEmpFirst(event.target.value)}
                                    required
                                  />
                                </Field>
                                <Field label="Middle name" hint="optional">
                                  <TextInput
                                    value={empMiddle}
                                    onChange={(event) => setEmpMiddle(event.target.value)}
                                  />
                                </Field>
                                <Field label="Last name">
                                  <TextInput
                                    value={empLast}
                                    onChange={(event) => setEmpLast(event.target.value)}
                                    required
                                  />
                                </Field>
                                <Field label="Suffix" hint="optional">
                                  <TextInput
                                    value={empSuffix}
                                    onChange={(event) => setEmpSuffix(event.target.value)}
                                    placeholder="Jr., Sr., III"
                                  />
                                </Field>
                                <Field label="Employee no." hint="optional">
                                  <TextInput
                                    value={empNo}
                                    onChange={(event) => setEmpNo(event.target.value)}
                                  />
                                </Field>
                                <Field label="Position" hint="optional">
                                  <TextInput
                                    value={empPosition}
                                    onChange={(event) => setEmpPosition(event.target.value)}
                                    placeholder="Teacher I"
                                  />
                                </Field>
                                <div className="flex gap-2 sm:col-span-2">
                                  <Btn type="submit" variant="primary" size="sm" disabled={busy}>
                                    {editingEmpId ? 'Save changes' : 'Add'}
                                  </Btn>
                                  <Btn variant="ghost" size="sm" onClick={resetEmpForm}>
                                    Cancel
                                  </Btn>
                                </div>
                              </form>
                            )}

                            {employeesLoading ? (
                              <Loading label="Loading roster…" />
                            ) : filteredEmployees.length === 0 ? (
                              <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                                {employees.length === 0
                                  ? 'No employees yet. Add the first one above.'
                                  : 'No employees match that search.'}
                              </p>
                            ) : (
                              <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                                {filteredEmployees.map((employee) => (
                                  <div
                                    key={employee.id}
                                    className="flex flex-wrap items-center gap-2 px-3 py-2.5"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-medium">
                                        {employeeName(employee)}
                                      </p>
                                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                        {[employee.employeeNo, employee.position]
                                          .filter(Boolean)
                                          .join(' · ') || 'No details'}
                                      </p>
                                    </div>
                                    <Badge tone={employee.isActive ? 'success' : 'neutral'}>
                                      {employee.isActive ? 'Active' : 'Inactive'}
                                    </Badge>
                                    {canWrite && (
                                      <>
                                        <Btn
                                          size="xs"
                                          variant="soft"
                                          onClick={() => startEditEmployee(employee)}
                                          disabled={busy}
                                        >
                                          <Pencil className="h-3 w-3" /> Edit
                                        </Btn>
                                        <Btn
                                          size="xs"
                                          variant="danger"
                                          onClick={() => void toggleEmployee(employee)}
                                          disabled={busy}
                                        >
                                          {employee.isActive ? 'Deactivate' : 'Reactivate'}
                                        </Btn>
                                      </>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {tab === 'holidays' && (
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-end gap-2">
                              <Field label="Year">
                                <YearSelect value={holidayYear} base={year} onChange={setHolidayYear} />
                              </Field>
                              <Btn
                                size="sm"
                                variant="soft"
                                onClick={() => void loadHolidays(schoolId, holidayYear)}
                                disabled={holidaysLoading}
                              >
                                <RefreshCw className={`h-3.5 w-3.5 ${holidaysLoading ? 'animate-spin' : ''}`} />
                              </Btn>
                              <Btn
                                size="sm"
                                variant="primary"
                                className="ml-auto"
                                onClick={importHolidays}
                                disabled={!hasDtr || holidaysLoading}
                                title={
                                  hasDtr
                                    ? `Import ${monthName(month)} holidays into the current DTR`
                                    : 'Upload attendance first'
                                }
                              >
                                <CalendarDays className="h-3.5 w-3.5" />
                                Import {monthName(month)}
                              </Btn>
                            </div>

                            {canWrite && (
                              <form
                                onSubmit={submitHoliday}
                                className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40 sm:grid-cols-[1fr_2fr_1fr_auto]"
                              >
                                <Field label="Date">
                                  <TextInput
                                    type="date"
                                    value={holidayDate}
                                    onChange={(event) => setHolidayDate(event.target.value)}
                                    required
                                  />
                                </Field>
                                <Field label="Name">
                                  <TextInput
                                    value={holidayName}
                                    onChange={(event) => setHolidayName(event.target.value)}
                                    placeholder="Araw ng Kagitingan"
                                    required
                                  />
                                </Field>
                                <Field label="Type">
                                  <SelectInput
                                    value={holidayType}
                                    onChange={(event) =>
                                      setHolidayType(event.target.value as CloudHoliday['type'])
                                    }
                                  >
                                    <option value="regular">Regular</option>
                                    <option value="special">Special</option>
                                    <option value="local">Local</option>
                                  </SelectInput>
                                </Field>
                                <div className="flex items-end">
                                  <Btn type="submit" variant="primary" size="sm" disabled={busy}>
                                    Add
                                  </Btn>
                                </div>
                              </form>
                            )}

                            {holidaysLoading ? (
                              <Loading label="Loading holidays…" />
                            ) : holidays.length === 0 ? (
                              <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                                No holidays recorded for {holidayYear}.
                              </p>
                            ) : (
                              <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                                {holidays.map((holiday) => (
                                  <div
                                    key={holiday.id}
                                    className="flex flex-wrap items-center gap-2 px-3 py-2"
                                  >
                                    <span className="w-16 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                      {prettyDate(holiday.holidayDate)}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-sm">
                                      {holiday.name}
                                    </span>
                                    <Badge>{holiday.type}</Badge>
                                    {holiday.schoolId === null ? (
                                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                        CSC
                                      </span>
                                    ) : (
                                      canWrite && (
                                        <Btn
                                          size="xs"
                                          variant="danger"
                                          onClick={() => void removeHoliday(holiday)}
                                          disabled={busy}
                                          aria-label={`Delete ${holiday.name}`}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Btn>
                                      )
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {tab === 'leave' && (
                          <div className="space-y-5">
                            <section>
                              <div className="mb-2 flex items-center gap-2">
                                <h3 className="text-sm font-semibold">Leave types</h3>
                                {canWrite && (
                                  <Btn
                                    size="xs"
                                    variant="soft"
                                    className="ml-auto"
                                    onClick={() => setShowTypeForm((value) => !value)}
                                  >
                                    <Plus className="h-3 w-3" /> Add type
                                  </Btn>
                                )}
                              </div>
                              {showTypeForm && canWrite && (
                                <form
                                  onSubmit={submitLeaveType}
                                  className="mb-2 grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40 sm:grid-cols-[100px_1fr_auto]"
                                >
                                  <Field label="Code">
                                    <TextInput
                                      value={leaveCode}
                                      onChange={(event) => setLeaveCode(event.target.value)}
                                      placeholder="VL"
                                      required
                                    />
                                  </Field>
                                  <Field label="Name">
                                    <TextInput
                                      value={leaveName}
                                      onChange={(event) => setLeaveName(event.target.value)}
                                      placeholder="Vacation Leave"
                                      required
                                    />
                                  </Field>
                                  <div className="flex items-end">
                                    <Btn type="submit" variant="primary" size="sm" disabled={busy}>
                                      Add
                                    </Btn>
                                  </div>
                                </form>
                              )}
                              <div className="flex flex-wrap gap-1.5">
                                {leaveTypes.map((type) => (
                                  <Badge key={type.id} tone="brand">
                                    {type.code} · {type.name}
                                  </Badge>
                                ))}
                                {!leaveTypes.length && !leaveLoading && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    No leave types yet.
                                  </p>
                                )}
                              </div>
                            </section>

                            <section>
                              <h3 className="mb-2 text-sm font-semibold">File leave</h3>
                              {canWrite ? (
                                <form
                                  onSubmit={submitLeaveApplication}
                                  className="grid gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-2"
                                >
                                  <Field label="Employee">
                                    <SelectInput
                                      value={selectedAppEmp}
                                      onChange={(event) => setAppEmp(event.target.value)}
                                      required
                                    >
                                      {activeEmployees.map((employee) => (
                                        <option key={employee.id} value={employee.id}>
                                          {employeeName(employee)}
                                        </option>
                                      ))}
                                    </SelectInput>
                                  </Field>
                                  <Field label="Leave type">
                                    <SelectInput
                                      value={selectedAppType}
                                      onChange={(event) => setAppType(event.target.value)}
                                      required
                                    >
                                      {leaveTypes.map((type) => (
                                        <option key={type.id} value={type.id}>
                                          {type.code} · {type.name}
                                        </option>
                                      ))}
                                    </SelectInput>
                                  </Field>
                                  <Field label="Start date">
                                    <TextInput
                                      type="date"
                                      value={appStart}
                                      onChange={(event) => setStart(event.target.value)}
                                      required
                                    />
                                  </Field>
                                  <Field label="End date">
                                    <TextInput
                                      type="date"
                                      value={appEnd}
                                      onChange={(event) => setEnd(event.target.value)}
                                      min={appStart || undefined}
                                      required
                                    />
                                  </Field>
                                  <Field label="Days">
                                    <TextInput
                                      type="number"
                                      min={0.5}
                                      step={0.5}
                                      value={appDays}
                                      onChange={(event) => setAppDays(event.target.value)}
                                      required
                                    />
                                  </Field>
                                  <Field label="Remarks" hint="optional">
                                    <TextInput
                                      value={appRemarks}
                                      onChange={(event) => setAppRemarks(event.target.value)}
                                    />
                                  </Field>
                                  <div className="sm:col-span-2">
                                    <Btn type="submit" variant="primary" size="sm" disabled={busy}>
                                      File leave
                                    </Btn>
                                  </div>
                                </form>
                              ) : (
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  Your role is read-only.
                                </p>
                              )}
                            </section>

                            <section>
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold">Applications</h3>
                                <YearSelect value={leaveYear} base={year} onChange={setLeaveYear} />
                                <Btn
                                  size="xs"
                                  variant="soft"
                                  className="ml-auto"
                                  onClick={() => void loadLeave(schoolId, leaveYear)}
                                  disabled={leaveLoading}
                                >
                                  <RefreshCw className={`h-3 w-3 ${leaveLoading ? 'animate-spin' : ''}`} />
                                </Btn>
                              </div>
                              {leaveLoading ? (
                                <Loading label="Loading leave…" />
                              ) : leaveApps.length === 0 ? (
                                <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                                  No leave applications for {leaveYear}.
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  {leaveApps.map((application) => (
                                    <div
                                      key={application.id}
                                      className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-medium">
                                          {application.employeeName}
                                        </p>
                                        <Badge tone={statusTone(application.status)}>
                                          {application.status}
                                        </Badge>
                                        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                                          {application.leaveCode} · {application.days} day
                                          {application.days === 1 ? '' : 's'}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        {prettyDate(application.startDate)} –{' '}
                                        {prettyDate(application.endDate)}
                                        {application.remarks ? ` · ${application.remarks}` : ''}
                                      </p>
                                      {canApprove && application.status === 'submitted' && (
                                        <div className="mt-2 flex gap-1.5">
                                          <Btn
                                            size="xs"
                                            variant="primary"
                                            onClick={() => void decideLeave(application, 'approved')}
                                            disabled={busy}
                                          >
                                            <Check className="h-3 w-3" /> Approve
                                          </Btn>
                                          <Btn
                                            size="xs"
                                            variant="danger"
                                            onClick={() => void decideLeave(application, 'rejected')}
                                            disabled={busy}
                                          >
                                            <X className="h-3 w-3" /> Reject
                                          </Btn>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </section>
                          </div>
                        )}

                        {tab === 'travels' && (
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-semibold">Official travel records</h3>
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                  Track travel orders separately from leave applications.
                                </p>
                              </div>
                              <YearSelect
                                value={travelYear}
                                base={year}
                                onChange={setTravelYear}
                              />
                              <Btn
                                size="sm"
                                variant="soft"
                                onClick={() => void loadTravels(schoolId, travelYear)}
                                disabled={travelsLoading}
                              >
                                <RefreshCw
                                  className={`h-3.5 w-3.5 ${travelsLoading ? 'animate-spin' : ''}`}
                                />
                              </Btn>
                              {canWrite && (
                                <Btn
                                  size="sm"
                                  variant="primary"
                                  onClick={() => setShowTravelForm((value) => !value)}
                                  disabled={activeEmployees.length === 0}
                                >
                                  <Plus className="h-3.5 w-3.5" /> Add travel
                                </Btn>
                              )}
                            </div>

                            {showTravelForm && canWrite && (
                              <form
                                onSubmit={submitTravel}
                                className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40 sm:grid-cols-2"
                              >
                                <Field label="Employee">
                                  <SelectInput
                                    value={selectedTravelEmp}
                                    onChange={(event) => setTravelEmp(event.target.value)}
                                    required
                                  >
                                    {activeEmployees.map((employee) => (
                                      <option key={employee.id} value={employee.id}>
                                        {employeeName(employee)}
                                      </option>
                                    ))}
                                  </SelectInput>
                                </Field>
                                <Field label="Reference no." hint="optional">
                                  <TextInput
                                    value={travelRef}
                                    onChange={(event) => setTravelRef(event.target.value)}
                                    placeholder="Travel order no."
                                  />
                                </Field>
                                <Field label="Destination">
                                  <TextInput
                                    value={travelDestination}
                                    onChange={(event) => setTravelDestination(event.target.value)}
                                    placeholder="Division office"
                                    required
                                  />
                                </Field>
                                <Field label="Purpose" hint="optional">
                                  <TextInput
                                    value={travelPurpose}
                                    onChange={(event) => setTravelPurpose(event.target.value)}
                                    placeholder="Seminar, meeting, field work…"
                                  />
                                </Field>
                                <Field label="Start date">
                                  <TextInput
                                    type="date"
                                    value={travelStart}
                                    onChange={(event) => setTravelStartDate(event.target.value)}
                                    required
                                  />
                                </Field>
                                <Field label="End date">
                                  <TextInput
                                    type="date"
                                    value={travelEnd}
                                    onChange={(event) => setTravelEndDate(event.target.value)}
                                    min={travelStart || undefined}
                                    required
                                  />
                                </Field>
                                <Field label="Days">
                                  <TextInput
                                    type="number"
                                    min={0.5}
                                    step={0.5}
                                    value={travelDays}
                                    onChange={(event) => setTravelDays(event.target.value)}
                                    required
                                  />
                                </Field>
                                <Field label="Status">
                                  <SelectInput
                                    value={travelStatus}
                                    onChange={(event) =>
                                      setTravelStatus(event.target.value as CloudTravelStatus)
                                    }
                                  >
                                    <option value="planned">Planned</option>
                                    <option value="approved">Approved</option>
                                  </SelectInput>
                                </Field>
                                <Field label="Remarks" hint="optional">
                                  <TextInput
                                    value={travelRemarks}
                                    onChange={(event) => setTravelRemarks(event.target.value)}
                                  />
                                </Field>
                                <div className="flex items-end gap-2">
                                  <Btn type="submit" variant="primary" size="sm" disabled={busy}>
                                    Save travel
                                  </Btn>
                                  <Btn
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowTravelForm(false)}
                                  >
                                    Cancel
                                  </Btn>
                                </div>
                              </form>
                            )}

                            {activeEmployees.length === 0 && canWrite && (
                              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                Add an active employee to the roster before recording official
                                travel.
                              </p>
                            )}

                            {travelsLoading ? (
                              <Loading label="Loading official travels…" />
                            ) : travels.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-800">
                                <Plane className="mx-auto h-6 w-6 text-slate-300 dark:text-slate-600" />
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                  No official travels recorded for {travelYear}.
                                </p>
                                {canWrite && activeEmployees.length > 0 && (
                                  <Btn
                                    size="sm"
                                    variant="soft"
                                    className="mt-3"
                                    onClick={() => setShowTravelForm(true)}
                                  >
                                    <Plus className="h-3.5 w-3.5" /> Record the first travel
                                  </Btn>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {travels.map((travel) => (
                                  <div
                                    key={travel.id}
                                    className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-semibold">{travel.destination}</p>
                                      <Badge tone={statusTone(travel.status)}>
                                        {travel.status}
                                      </Badge>
                                      {travel.referenceNo && (
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                          {travel.referenceNo}
                                        </span>
                                      )}
                                      {canWrite && (
                                        <div className="ml-auto flex flex-wrap gap-1.5">
                                          {travel.status === 'planned' && (
                                            <Btn
                                              size="xs"
                                              variant="primary"
                                              onClick={() =>
                                                void changeTravelStatus(travel, 'approved')
                                              }
                                              disabled={busy}
                                            >
                                              <Check className="h-3 w-3" /> Approve
                                            </Btn>
                                          )}
                                          {travel.status === 'approved' && (
                                            <Btn
                                              size="xs"
                                              variant="soft"
                                              onClick={() =>
                                                void changeTravelStatus(travel, 'completed')
                                              }
                                              disabled={busy}
                                            >
                                              <Check className="h-3 w-3" /> Complete
                                            </Btn>
                                          )}
                                          {(travel.status === 'planned' ||
                                            travel.status === 'approved') && (
                                            <Btn
                                              size="xs"
                                              variant="danger"
                                              onClick={() =>
                                                void changeTravelStatus(travel, 'cancelled')
                                              }
                                              disabled={busy}
                                            >
                                              <X className="h-3 w-3" /> Cancel
                                            </Btn>
                                          )}
                                          <Btn
                                            size="xs"
                                            variant="danger"
                                            onClick={() => void removeTravel(travel)}
                                            disabled={busy}
                                            aria-label={`Delete travel to ${travel.destination}`}
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Btn>
                                        </div>
                                      )}
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                      {travel.employeeName} · {prettyDate(travel.startDate)} –{' '}
                                      {prettyDate(travel.endDate)} · {travel.days} day
                                      {travel.days === 1 ? '' : 's'}
                                      {travel.purpose ? ` · ${travel.purpose}` : ''}
                                    </p>
                                    {travel.remarks && (
                                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                        {travel.remarks}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {tab === 'dtr' && (
                          <div className="space-y-3">
                            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold">
                                    Save current session
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {monthName(month)} {year} · selected employees only
                                  </p>
                                </div>
                                <Btn
                                  variant="primary"
                                  size="sm"
                                  onClick={() => void saveDtr()}
                                  disabled={!hasDtr || !canWrite || saveBusy}
                                >
                                  {saveBusy ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Cloud className="h-3.5 w-3.5" />
                                  )}
                                  Save DTR
                                </Btn>
                              </div>
                              {!hasDtr && (
                                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                  Upload attendance first to save a DTR.
                                </p>
                              )}
                              {saveResult && (
                                <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
                                  {saveResult}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold">
                                Periods · {monthName(month)} {year}
                              </h3>
                              <Btn
                                size="xs"
                                variant="soft"
                                className="ml-auto"
                                onClick={() => void loadPeriods(schoolId)}
                                disabled={periodsLoading}
                              >
                                <RefreshCw className={`h-3 w-3 ${periodsLoading ? 'animate-spin' : ''}`} />
                              </Btn>
                            </div>

                            {periodsLoading ? (
                              <Loading label="Loading DTR periods…" />
                            ) : periods.length === 0 ? (
                              <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                                No DTR periods saved for {monthName(month)} {year}.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {periods.map((period) => (
                                  <div
                                    key={period.id}
                                    className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                                  >
                                    <p className="text-sm font-medium">{period.employeeName}</p>
                                    <Badge tone={statusTone(period.status)}>{period.status}</Badge>
                                    <div className="ml-auto flex flex-wrap gap-1.5">
                                      {canWrite && period.status === 'draft' && (
                                        <Btn
                                          size="xs"
                                          variant="soft"
                                          onClick={() => void changePeriod(period, 'reviewed')}
                                          disabled={busy}
                                        >
                                          Review
                                        </Btn>
                                      )}
                                      {canApprove &&
                                        (period.status === 'draft' ||
                                          period.status === 'reviewed') && (
                                          <Btn
                                            size="xs"
                                            variant="primary"
                                            onClick={() => void changePeriod(period, 'approved')}
                                            disabled={busy}
                                          >
                                            Approve
                                          </Btn>
                                        )}
                                      {canApprove && period.status === 'approved' && (
                                        <Btn
                                          size="xs"
                                          variant="primary"
                                          onClick={() => void changePeriod(period, 'locked')}
                                          disabled={busy}
                                        >
                                          <Lock className="h-3 w-3" /> Lock
                                        </Btn>
                                      )}
                                      {canWrite && period.status === 'reviewed' && (
                                        <Btn
                                          size="xs"
                                          variant="ghost"
                                          onClick={() => void changePeriod(period, 'draft')}
                                          disabled={busy}
                                        >
                                          Reopen
                                        </Btn>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                  )}
                </>
              )}
            </div>
            </main>

            <footer className="border-t border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-950/50">
              <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 px-4 py-5 text-[11px] text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                    <Cloud className="h-3.5 w-3.5" />
                  </span>
                  <span>
                    <span className="block font-semibold text-slate-700 dark:text-slate-200">
                      DTR Workspace
                    </span>
                    <span className="block">Attendance files stay on this device.</span>
                  </span>
                </div>
                <p className="max-w-xl leading-relaxed">
                  Saving a DTR uploads only that month’s day records to your school workspace.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  {isSystemAdmin && (
                    <button
                      type="button"
                      onClick={onOpenAdmin}
                      className="font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                    >
                      Admin console
                    </button>
                  )}
                  <span>© {new Date().getFullYear()}</span>
                </div>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
