import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  LayoutDashboard,
  Loader2,
  LogOut,
  RefreshCw,
  School,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { Badge, Btn, Card, Field, SelectInput, TextInput } from './ui';
import {
  getAdminOverview,
  getAdminSchoolDetail,
  getSession,
  listAdminActivity,
  listAdminMemberships,
  listAdminSchools,
  signIn,
  signOut,
  updateAdminMembership,
} from '../lib/api';
import type {
  AdminActivityEntry,
  AdminMembership,
  AdminOverview,
  AdminSchool,
  AdminSchoolDetail,
  AdminSchoolMember,
  CloudMembershipStatus,
  CloudSession,
} from '../lib/api';

type Page = 'overview' | 'requests' | 'schools' | 'activity';
type Route = { page: Page; schoolId?: string };

type Props = {
  onExit: () => void;
  onAdminChange: (value: boolean) => void;
};

const PAGE_SIZE = 20;
const ACTIVITY_LIMIT = 50;

const NAV: { id: Page; label: string; icon: typeof Users }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'requests', label: 'Access requests', icon: UserCheck },
  { id: 'schools', label: 'Schools', icon: School },
  { id: 'activity', label: 'Activity', icon: Activity },
];

const PAGE_META: Record<Page, { title: string; subtitle: string }> = {
  overview: {
    title: 'Overview',
    subtitle: 'A live view of schools, access, and DTR activity.',
  },
  requests: {
    title: 'Access requests',
    subtitle: 'Approve, decline, or suspend school workspace access.',
  },
  schools: {
    title: 'Schools',
    subtitle: 'Monitor every school workspace and its workload.',
  },
  activity: {
    title: 'Activity',
    subtitle: 'Recent workspace actions across every school.',
  },
};

const ACTIVITY_LABELS: Record<string, string> = {
  'school.create': 'School created',
  'school.update': 'School updated',
  'member.add': 'Member added',
  'member.update': 'Member updated',
  'member.remove': 'Member removed',
  'membership.request': 'Access requested',
  'membership.approve': 'Access approved',
  'membership.reject': 'Access declined',
  'membership.suspend': 'Access suspended',
  'employee.create': 'Employee added',
  'employee.update': 'Employee updated',
  'employee.deactivate': 'Employee deactivated',
  'holiday.create': 'Holiday added',
  'holiday.update': 'Holiday updated',
  'holiday.delete': 'Holiday removed',
  'leave_type.create': 'Leave type added',
  'leave_type.update': 'Leave type updated',
  'leave_type.delete': 'Leave type removed',
  'leave_application.create': 'Leave filed',
  'leave_application.update': 'Leave updated',
  'leave_credits.update': 'Leave credits updated',
  'dtr_period.create': 'DTR created',
  'dtr_period.status': 'DTR status changed',
  'dtr_period.delete': 'DTR deleted',
  'dtr_days.upsert': 'DTR days saved',
  'dtr_day.delete': 'DTR day cleared',
  'dtr.period.create': 'DTR created',
  'dtr.period.update': 'DTR updated',
  'dtr.days.save': 'DTR saved',
};

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong.';
}

function readRoute(): Route {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const page = parts[1];
  if (page === 'requests' || page === 'activity' || page === 'schools') {
    return {
      page,
      schoolId:
        page === 'schools' && parts[2] ? decodeURIComponent(parts[2]) : undefined,
    };
  }
  return { page: 'overview' };
}

function pageHash(page: Page): string {
  return page === 'overview' ? '#/admin' : `#/admin/${page}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString();
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function membershipTone(status: CloudMembershipStatus) {
  if (status === 'active') return 'success' as const;
  if (status === 'pending') return 'brand' as const;
  return 'warn' as const;
}

function dtrTone(status: string) {
  if (status === 'approved' || status === 'locked') return 'success' as const;
  if (status === 'reviewed') return 'brand' as const;
  return 'neutral' as const;
}

function activityLabel(entry: AdminActivityEntry): string {
  if (ACTIVITY_LABELS[entry.action]) return ACTIVITY_LABELS[entry.action];
  return entry.action.replace(/[._]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function activitySummary(entry: AdminActivityEntry): string {
  const meta = entry.meta as Record<string, unknown> | null;
  if (!meta || typeof meta !== 'object') return '';
  const bits: string[] = [];
  if (typeof meta.email === 'string') bits.push(meta.email);
  if (typeof meta.name === 'string' && !bits.includes(meta.name)) bits.push(meta.name);
  if (typeof meta.from === 'string' || typeof meta.to === 'string') {
    bits.push(`${String(meta.from ?? '?')} to ${String(meta.to ?? '?')}`);
  }
  return bits.join(' · ');
}

function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-slate-500 dark:text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

function ErrorNotice({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-700">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'neutral',
  hint,
  onClick,
}: {
  label: string;
  value: number | null | undefined;
  icon: typeof Users;
  tone?: 'neutral' | 'brand' | 'success' | 'warn';
  hint?: string;
  onClick?: () => void;
}) {
  const toneClass = {
    neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-sky-300',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    warn: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  }[tone];

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">
        {value === null || value === undefined ? '—' : value.toLocaleString()}
      </p>
      {hint && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
    </>
  );

  const className =
    'rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900';

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} hover:border-brand-300 dark:hover:border-brand-700`}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

function Panel({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function ProgressRow({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: 'neutral' | 'brand' | 'success' | 'warn';
}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  const bar = {
    neutral: 'bg-slate-400 dark:bg-slate-500',
    brand: 'bg-brand-500',
    success: 'bg-emerald-500',
    warn: 'bg-amber-500',
  }[tone];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-slate-600 dark:text-slate-300">{label}</span>
        <span className="text-slate-500 dark:text-slate-400">
          {value.toLocaleString()} · {percent}%
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function ActivityList({
  entries,
  empty = 'No activity yet.',
}: {
  entries: AdminActivityEntry[];
  empty?: string;
}) {
  if (!entries.length) return <EmptyState title={empty} />;

  return (
    <ol className="space-y-2">
      {entries.map((entry) => {
        const summary = activitySummary(entry);
        return (
          <li
            key={entry.id}
            className="flex gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800"
          >
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              <Activity className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <p className="text-[13px] font-medium">{activityLabel(entry)}</p>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {formatDateTime(entry.createdAt)}
                </span>
              </div>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {entry.actorName ?? entry.actorEmail ?? 'System'} ·{' '}
                {entry.schoolName ?? 'Unknown school'}
              </p>
              {summary && (
                <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {summary}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function MembershipCard({
  membership,
  busy,
  onDecide,
}: {
  membership: AdminMembership;
  busy: boolean;
  onDecide: (membership: AdminMembership, status: 'active' | 'rejected' | 'suspended') => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {membership.name}{' '}
            <span className="font-normal text-slate-500 dark:text-slate-400">
              {membership.email}
            </span>
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {membership.schoolName}
            {membership.schoolCode ? ` · ${membership.schoolCode}` : ''} · {membership.role} ·{' '}
            {formatDate(membership.createdAt)}
          </p>
        </div>
        <Badge tone={membershipTone(membership.status)}>{membership.status}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {membership.status === 'pending' && (
          <>
            <Btn
              size="xs"
              variant="primary"
              disabled={busy}
              onClick={() => onDecide(membership, 'active')}
            >
              <Check className="h-3 w-3" /> Approve
            </Btn>
            <Btn
              size="xs"
              variant="danger"
              disabled={busy}
              onClick={() => onDecide(membership, 'rejected')}
            >
              <X className="h-3 w-3" /> Decline
            </Btn>
          </>
        )}
        {membership.status === 'active' && (
          <Btn
            size="xs"
            variant="danger"
            disabled={busy}
            onClick={() => onDecide(membership, 'suspended')}
          >
            Suspend
          </Btn>
        )}
        {(membership.status === 'rejected' || membership.status === 'suspended') && (
          <Btn
            size="xs"
            variant="primary"
            disabled={busy}
            onClick={() => onDecide(membership, 'active')}
          >
            Activate
          </Btn>
        )}
      </div>
    </div>
  );
}

function OverviewPage({
  overview,
  loading,
  error,
  refreshKey,
  onRefresh,
  onOpenRequests,
  onOpenActivity,
  onChanged,
}: {
  overview: AdminOverview | null;
  loading: boolean;
  error: string;
  refreshKey: number;
  onRefresh: () => void;
  onOpenRequests: () => void;
  onOpenActivity: () => void;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<AdminMembership[]>([]);
  const [activity, setActivity] = useState<AdminActivityEntry[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [busyId, setBusyId] = useState('');

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    setFeedError('');
    try {
      const [requests, entries] = await Promise.all([
        listAdminMemberships('pending'),
        listAdminActivity({ limit: 8 }),
      ]);
      setPending(requests);
      setActivity(entries);
    } catch (cause) {
      setFeedError(errorText(cause));
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed, refreshKey]);

  const decide = async (
    membership: AdminMembership,
    status: 'active' | 'rejected' | 'suspended',
  ) => {
    setBusyId(membership.id);
    setFeedError('');
    try {
      await updateAdminMembership(membership.id, status);
      await loadFeed();
      onChanged();
    } catch (cause) {
      setFeedError(errorText(cause));
    } finally {
      setBusyId('');
    }
  };

  const totalDtr =
    (overview?.dtrDraft ?? 0) +
    (overview?.dtrReviewed ?? 0) +
    (overview?.dtrApproved ?? 0) +
    (overview?.dtrLocked ?? 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Schools" value={overview?.schools} icon={School} />
          <StatCard
            label="Pending access"
            value={overview?.pendingRequests}
            icon={UserCheck}
            tone="brand"
            hint="Click to review"
            onClick={onOpenRequests}
          />
          <StatCard
            label="Active members"
            value={overview?.activeMembers}
            icon={Users}
            tone="success"
          />
          <StatCard
            label="Active employees"
            value={overview?.activeEmployees}
            icon={Users}
          />
          <StatCard
            label="Pending leave"
            value={overview?.pendingLeave}
            icon={CalendarDays}
            tone="warn"
          />
          <StatCard
            label="DTRs in review"
            value={(overview?.dtrDraft ?? 0) + (overview?.dtrReviewed ?? 0)}
            icon={FileText}
            tone="brand"
          />
          <StatCard
            label="Approved DTRs"
            value={overview?.dtrApproved}
            icon={Check}
            tone="success"
          />
          <StatCard
            label="Activity · 7 days"
            value={overview?.auditRecent}
            icon={Activity}
            hint={`${(overview?.auditEvents ?? 0).toLocaleString()} total events`}
          />
        </div>
      </div>

      <ErrorNotice message={error} />
      <ErrorNotice message={feedError} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Panel
          title="Workspace workload"
          hint="DTR pipeline across every school."
          action={
            <Btn size="xs" variant="soft" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Btn>
          }
        >
          {loading ? (
            <LoadingBlock label="Loading overview…" />
          ) : (
            <div className="space-y-4">
              <ProgressRow
                label="Draft"
                value={overview?.dtrDraft ?? 0}
                total={totalDtr}
                tone="neutral"
              />
              <ProgressRow
                label="Reviewed"
                value={overview?.dtrReviewed ?? 0}
                total={totalDtr}
                tone="brand"
              />
              <ProgressRow
                label="Approved"
                value={overview?.dtrApproved ?? 0}
                total={totalDtr}
                tone="success"
              />
              <ProgressRow
                label="Locked"
                value={overview?.dtrLocked ?? 0}
                total={totalDtr}
                tone="success"
              />
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <span>{totalDtr.toLocaleString()} total DTR periods</span>
                <span>{overview?.pendingLeave ?? 0} leave awaiting action</span>
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="Access requests"
          hint="New members waiting for approval."
          action={
            <Btn size="xs" variant="ghost" onClick={onOpenRequests}>
              View all
            </Btn>
          }
        >
          {feedLoading ? (
            <LoadingBlock label="Loading requests…" />
          ) : pending.length === 0 ? (
            <EmptyState title="No pending requests" hint="New AO requests will appear here." />
          ) : (
            <div className="space-y-2">
              {pending.slice(0, 5).map((membership) => (
                <MembershipCard
                  key={membership.id}
                  membership={membership}
                  busy={busyId === membership.id}
                  onDecide={(item, status) => void decide(item, status)}
                />
              ))}
              {pending.length > 5 && (
                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  {pending.length - 5} more request{pending.length - 5 === 1 ? '' : 's'}
                </p>
              )}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Recent activity"
        hint="The latest actions across all school workspaces."
        action={
          <Btn size="xs" variant="ghost" onClick={onOpenActivity}>
            View all
          </Btn>
        }
      >
        {feedLoading ? (
          <LoadingBlock label="Loading activity…" />
        ) : (
          <ActivityList entries={activity} />
        )}
      </Panel>
    </div>
  );
}

function RequestsPage({
  refreshKey,
  onChanged,
}: {
  refreshKey: number;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<CloudMembershipStatus | 'all'>('pending');
  const [rows, setRows] = useState<AdminMembership[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await listAdminMemberships(status === 'all' ? undefined : status));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.name, row.email, row.schoolName, row.schoolCode ?? '', row.role]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [rows, search]);

  const decide = async (
    membership: AdminMembership,
    nextStatus: 'active' | 'rejected' | 'suspended',
  ) => {
    setBusyId(membership.id);
    setError('');
    try {
      await updateAdminMembership(membership.id, nextStatus);
      await load();
      onChanged();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Status">
          <SelectInput
            value={status}
            onChange={(event) => setStatus(event.target.value as CloudMembershipStatus | 'all')}
            className="!w-auto"
          >
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="rejected">Declined</option>
            <option value="suspended">Suspended</option>
            <option value="all">All</option>
          </SelectInput>
        </Field>
        <div className="min-w-[220px] flex-1">
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <TextInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, email, school, role…"
                className="!pl-9"
              />
            </div>
          </Field>
        </div>
        <Badge>{filtered.length} shown</Badge>
      </div>

      <ErrorNotice message={error} />

      {loading ? (
        <LoadingBlock label="Loading memberships…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No memberships found"
          hint="Try another status or clear the search."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((membership) => (
            <MembershipCard
              key={membership.id}
              membership={membership}
              busy={busyId === membership.id}
              onDecide={(item, nextStatus) => void decide(item, nextStatus)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SchoolsPage({
  refreshKey,
  onOpen,
}: {
  refreshKey: number;
  onOpen: (schoolId: string) => void;
}) {
  const [schools, setSchools] = useState<AdminSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSchools(await listAdminSchools());
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return schools;
    return schools.filter((school) =>
      [
        school.name,
        school.schoolCode ?? '',
        school.division ?? '',
        school.region ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [schools, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1">
          <Field label="Search schools">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <TextInput
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
                placeholder="School, code, division, region…"
                className="!pl-9"
              />
            </div>
          </Field>
        </div>
        <Badge>{filtered.length.toLocaleString()} schools</Badge>
      </div>

      <ErrorNotice message={error} />

      {loading ? (
        <LoadingBlock label="Loading schools…" />
      ) : filtered.length === 0 ? (
        <EmptyState title="No schools found" hint="Try a different search term." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">School</th>
                  <th className="px-4 py-3 font-semibold">Code</th>
                  <th className="px-4 py-3 text-right font-semibold">Members</th>
                  <th className="px-4 py-3 text-right font-semibold">Pending</th>
                  <th className="px-4 py-3 text-right font-semibold">Employees</th>
                  <th className="px-4 py-3 text-right font-semibold">DTR due</th>
                  <th className="px-4 py-3 text-right font-semibold">Leave due</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pageRows.map((school) => (
                  <tr
                    key={school.id}
                    className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="max-w-[300px] px-4 py-3">
                      <p className="truncate font-medium">{school.name}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {[school.division, school.region].filter(Boolean).join(' · ') ||
                          'No division set'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {school.schoolCode ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">{school.memberCount}</td>
                    <td className="px-4 py-3 text-right">
                      {school.pendingCount > 0 ? (
                        <Badge tone="brand">{school.pendingCount}</Badge>
                      ) : (
                        <span className="text-xs text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {school.employeeCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {school.dtrPendingCount > 0 ? (
                        <Badge tone="warn">{school.dtrPendingCount}</Badge>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {school.leavePendingCount > 0 ? (
                        <Badge tone="warn">{school.leavePendingCount}</Badge>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Btn size="xs" variant="soft" onClick={() => onOpen(school.id)}>
                        View
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>
              Showing {safePage * PAGE_SIZE + 1}–
              {Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of{' '}
              {filtered.length.toLocaleString()}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <Btn
                size="xs"
                variant="ghost"
                disabled={safePage === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                Previous
              </Btn>
              <span className="px-2">
                {safePage + 1} / {pageCount}
              </span>
              <Btn
                size="xs"
                variant="ghost"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              >
                Next
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SchoolDetailPage({
  schoolId,
  refreshKey,
  onBack,
  onChanged,
}: {
  schoolId: string;
  refreshKey: number;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<AdminSchoolDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDetail(await getAdminSchoolDetail(schoolId));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const decide = async (
    member: AdminSchoolMember,
    status: 'active' | 'rejected' | 'suspended',
  ) => {
    setBusyId(member.id);
    setError('');
    try {
      await updateAdminMembership(member.id, status);
      await load();
      onChanged();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusyId('');
    }
  };

  if (loading && !detail) {
    return <LoadingBlock label="Loading school…" />;
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <Btn variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to schools
        </Btn>
        <ErrorNotice message={error || 'School not found.'} />
      </div>
    );
  }

  const school = detail.school;
  const totalDtr =
    school.dtrDraft + school.dtrReviewed + school.dtrApproved + school.dtrLocked;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Btn variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to schools
        </Btn>
        <Badge>{school.schoolCode ?? 'No school code'}</Badge>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Updated {formatDate(school.updatedAt)}
        </span>
      </div>

      <Card>
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
            <School className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight">{school.name}</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {[school.division, school.region].filter(Boolean).join(' · ') ||
                'No division or region set'}
            </p>
          </div>
          <Badge tone={school.pendingCount > 0 ? 'warn' : 'success'}>
            {school.pendingCount > 0
              ? `${school.pendingCount} pending`
              : 'No pending requests'}
          </Badge>
        </div>
      </Card>

      <ErrorNotice message={error} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active members" value={school.memberCount} icon={Users} tone="success" />
        <StatCard label="Active employees" value={school.employeeCount} icon={Users} />
        <StatCard label="DTRs in review" value={school.dtrPendingCount} icon={FileText} tone="brand" />
        <StatCard label="Pending leave" value={school.leavePendingCount} icon={CalendarDays} tone="warn" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Panel title="DTR pipeline" hint="Current period status for this school.">
          <div className="space-y-4">
            <ProgressRow label="Draft" value={school.dtrDraft} total={totalDtr} tone="neutral" />
            <ProgressRow label="Reviewed" value={school.dtrReviewed} total={totalDtr} tone="brand" />
            <ProgressRow label="Approved" value={school.dtrApproved} total={totalDtr} tone="success" />
            <ProgressRow label="Locked" value={school.dtrLocked} total={totalDtr} tone="success" />
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <Badge tone={dtrTone('draft')}>{school.dtrDraft} draft</Badge>
              <Badge tone={dtrTone('reviewed')}>{school.dtrReviewed} reviewed</Badge>
              <Badge tone={dtrTone('approved')}>{school.dtrApproved} approved</Badge>
              <Badge tone={dtrTone('locked')}>{school.dtrLocked} locked</Badge>
            </div>
          </div>
        </Panel>

        <Panel title="Members" hint={`${detail.members.length} school membership record(s).`}>
          {detail.members.length === 0 ? (
            <EmptyState title="No members yet" hint="Approved AOs will appear here." />
          ) : (
            <div className="space-y-2">
              {detail.members.map((member) => (
                <div
                  key={member.id}
                  className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {member.name}{' '}
                        <span className="font-normal text-slate-500 dark:text-slate-400">
                          {member.email}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {member.role} · joined {formatDate(member.createdAt)}
                      </p>
                    </div>
                    <Badge tone={membershipTone(member.status)}>{member.status}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {member.status === 'pending' && (
                      <>
                        <Btn
                          size="xs"
                          variant="primary"
                          disabled={busyId === member.id}
                          onClick={() => void decide(member, 'active')}
                        >
                          <Check className="h-3 w-3" /> Approve
                        </Btn>
                        <Btn
                          size="xs"
                          variant="danger"
                          disabled={busyId === member.id}
                          onClick={() => void decide(member, 'rejected')}
                        >
                          <X className="h-3 w-3" /> Decline
                        </Btn>
                      </>
                    )}
                    {member.status === 'active' && (
                      <Btn
                        size="xs"
                        variant="danger"
                        disabled={busyId === member.id}
                        onClick={() => void decide(member, 'suspended')}
                      >
                        Suspend
                      </Btn>
                    )}
                    {(member.status === 'rejected' || member.status === 'suspended') && (
                      <Btn
                        size="xs"
                        variant="primary"
                        disabled={busyId === member.id}
                        onClick={() => void decide(member, 'active')}
                      >
                        Activate
                      </Btn>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Recent school activity" hint="The latest 20 actions in this workspace.">
        <ActivityList entries={detail.activity} empty="No activity recorded for this school." />
      </Panel>
    </div>
  );
}

function ActivityPage({ refreshKey }: { refreshKey: number }) {
  const [entries, setEntries] = useState<AdminActivityEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await listAdminActivity({ limit: ACTIVITY_LIMIT });
      setEntries(next);
      setHasMore(next.length === ACTIVITY_LIMIT);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const loadMore = async () => {
    const last = entries[entries.length - 1];
    if (!last) return;
    setLoadingMore(true);
    setError('');
    try {
      const next = await listAdminActivity({
        limit: ACTIVITY_LIMIT,
        before: last.createdAt,
      });
      setEntries((current) => {
        const seen = new Set(current.map((entry) => entry.id));
        return [...current, ...next.filter((entry) => !seen.has(entry.id))];
      });
      setHasMore(next.length === ACTIVITY_LIMIT);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) =>
      [
        entry.actorName ?? '',
        entry.actorEmail ?? '',
        entry.schoolName ?? '',
        entry.action,
        entry.entityType,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [entries, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1">
          <Field label="Search activity">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <TextInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Person, school, action…"
                className="!pl-9"
              />
            </div>
          </Field>
        </div>
        <Badge>{filtered.length.toLocaleString()} shown</Badge>
      </div>

      <ErrorNotice message={error} />

      {loading ? (
        <LoadingBlock label="Loading activity…" />
      ) : filtered.length === 0 ? (
        <EmptyState title="No activity found" hint="Try a different search term." />
      ) : (
        <>
          <ActivityList entries={filtered} />
          {hasMore && !search && (
            <div className="flex justify-center pt-1">
              <Btn
                variant="soft"
                size="sm"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Load more
              </Btn>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminConsole({ onExit, onAdminChange }: Props) {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<CloudSession | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [route, setRoute] = useState<Route>(() => readRoute());
  const [refreshKey, setRefreshKey] = useState(0);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');

  useEffect(() => {
    let active = true;
    void getSession().then((next) => {
      if (!active) return;
      setSession(next);
      onAdminChange(next?.isSystemAdmin ?? false);
      setBooting(false);
    });
    return () => {
      active = false;
    };
  }, [onAdminChange]);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError('');
    try {
      setOverview(await getAdminOverview());
    } catch (cause) {
      setOverviewError(errorText(cause));
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.isSystemAdmin) void loadOverview();
  }, [session, loadOverview]);

  const refresh = () => {
    void loadOverview();
    setRefreshKey((current) => current + 1);
  };

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email.trim(), password);
      const next = await getSession();
      if (!next) throw new Error('Could not load your session. Try again.');
      setSession(next);
      onAdminChange(next.isSystemAdmin);
      setPassword('');
      if (!next.isSystemAdmin) {
        setError('This account is not a system admin.');
      }
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    await signOut().catch(() => undefined);
    setSession(null);
    onAdminChange(false);
    setPassword('');
    setError('');
    setBusy(false);
  };

  if (booting) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking admin access…
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
        <Card className="w-full max-w-md">
          <div className="text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h1 className="mt-4 text-lg font-semibold tracking-tight">System administration</h1>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
              Sign in with an account that has system admin access.
            </p>
          </div>

          <form onSubmit={submitAuth} className="mt-5 space-y-3">
            <Field label="Email">
              <TextInput
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </Field>
            <Field label="Password">
              <TextInput
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <ErrorNotice message={error} />
            <Btn type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
            </Btn>
          </form>

          <Btn variant="subtle" size="sm" className="mt-4 w-full" onClick={onExit}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to DTR Tool
          </Btn>
        </Card>
      </div>
    );
  }

  if (!session.isSystemAdmin) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
        <Card className="w-full max-w-md text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">Not authorized</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
            {session.user.email} does not have system admin access.
          </p>
          <ErrorNotice message={error} />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Btn variant="primary" onClick={() => void logout()} disabled={busy}>
              Sign out
            </Btn>
            <Btn variant="ghost" onClick={onExit}>
              Back to DTR Tool
            </Btn>
          </div>
        </Card>
      </div>
    );
  }

  const activePage = route.schoolId ? 'schools' : route.page;
  const meta = PAGE_META[activePage];
  const pendingCount = overview?.pendingRequests ?? 0;

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-5 dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <div className="flex items-center gap-3 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
            <Clock3 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">DTR Admin</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">System console</p>
          </div>
        </div>

        <nav className="mt-6 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  window.location.hash = pageHash(item.id);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                  active
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {item.id === 'requests' && pendingCount > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      active
                        ? 'bg-white/20 text-white dark:bg-slate-900/15 dark:text-slate-900'
                        : 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-sky-300'
                    }`}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5 px-1">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {initials(session.user.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{session.user.name}</p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {session.user.email}
              </p>
            </div>
          </div>
          <Btn
            variant="soft"
            size="sm"
            className="w-full"
            onClick={() => void logout()}
            disabled={busy}
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Btn>
          <Btn variant="subtle" size="sm" className="w-full" onClick={onExit}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to DTR Tool
          </Btn>
        </div>
      </aside>

      <div className="lg:pl-64">
        <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900">
              <Clock3 className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">DTR Admin</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">System console</p>
            </div>
            <Btn size="xs" variant="soft" onClick={refresh} disabled={overviewLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${overviewLoading ? 'animate-spin' : ''}`} />
            </Btn>
            <Btn size="xs" variant="ghost" onClick={onExit}>
              <ArrowLeft className="h-3.5 w-3.5" />
            </Btn>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    window.location.hash = pageHash(item.id);
                  }}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                  {item.id === 'requests' && pendingCount > 0 && (
                    <span className="rounded-full bg-white/20 px-1.5 text-[10px] dark:bg-slate-900/15">
                      {pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <header className="sticky top-0 z-20 hidden border-b border-slate-200 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 lg:block">
          <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-6">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                System administration
              </p>
              <h1 className="truncate text-lg font-semibold tracking-tight">{meta.title}</h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Btn size="sm" variant="soft" onClick={refresh} disabled={overviewLoading}>
                <RefreshCw className={`h-3.5 w-3.5 ${overviewLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Btn>
              <Btn size="sm" variant="ghost" onClick={onExit}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back to app
              </Btn>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-5 flex items-end gap-3 lg:hidden">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                System administration
              </p>
              <h1 className="truncate text-lg font-semibold tracking-tight">{meta.title}</h1>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{meta.subtitle}</p>
            </div>
          </div>

          {route.schoolId ? (
            <SchoolDetailPage
              schoolId={route.schoolId}
              refreshKey={refreshKey}
              onBack={() => {
                window.location.hash = '#/admin/schools';
              }}
              onChanged={() => void loadOverview()}
            />
          ) : route.page === 'requests' ? (
            <RequestsPage refreshKey={refreshKey} onChanged={() => void loadOverview()} />
          ) : route.page === 'schools' ? (
            <SchoolsPage
              refreshKey={refreshKey}
              onOpen={(schoolId) => {
                window.location.hash = `#/admin/schools/${encodeURIComponent(schoolId)}`;
              }}
            />
          ) : route.page === 'activity' ? (
            <ActivityPage refreshKey={refreshKey} />
          ) : (
            <OverviewPage
              overview={overview}
              loading={overviewLoading}
              error={overviewError}
              refreshKey={refreshKey}
              onRefresh={refresh}
              onOpenRequests={() => {
                window.location.hash = '#/admin/requests';
              }}
              onOpenActivity={() => {
                window.location.hash = '#/admin/activity';
              }}
              onChanged={() => void loadOverview()}
            />
          )}
        </main>
      </div>
    </div>
  );
}
