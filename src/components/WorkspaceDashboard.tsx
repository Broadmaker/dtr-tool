import type { ReactNode } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Cloud,
  FileText,
  MapPin,
  Plane,
  Users,
} from 'lucide-react';
import { Badge, Btn } from './ui';
import { monthName, prettyDate } from '../lib/dateUtils';
import type {
  CloudDtrPeriod,
  CloudEmployee,
  CloudHoliday,
  CloudLeaveApplication,
  CloudOfficialTravel,
} from '../lib/api';
import { roleLabel } from '../lib/roles';

export type WorkspaceTab =
  | 'dashboard'
  | 'roster'
  | 'holidays'
  | 'leave'
  | 'travels'
  | 'dtr';

type Props = {
  schoolName: string;
  role: string;
  month: number;
  year: number;
  employees: CloudEmployee[];
  holidays: CloudHoliday[];
  leaveApps: CloudLeaveApplication[];
  periods: CloudDtrPeriod[];
  travels: CloudOfficialTravel[];
  loading: boolean;
  canWrite: boolean;
  onTabChange: (tab: WorkspaceTab) => void;
};

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

function statusTone(status: string): 'neutral' | 'brand' | 'success' | 'warn' {
  if (status === 'approved' || status === 'completed' || status === 'locked') return 'success';
  if (status === 'submitted' || status === 'reviewed') return 'brand';
  if (status === 'cancelled') return 'warn';
  return 'neutral';
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
      {children}
    </p>
  );
}

export default function WorkspaceDashboard({
  schoolName,
  role,
  month,
  year,
  employees,
  holidays,
  leaveApps,
  periods,
  travels,
  loading,
  canWrite,
  onTabChange,
}: Props) {
  const today = todayKey();
  const activeEmployees = employees.filter((employee) => employee.isActive);
  const submittedLeave = leaveApps.filter((application) => application.status === 'submitted');
  const approvedLeave = leaveApps.filter((application) => application.status === 'approved');
  const upcomingHolidays = holidays
    .filter((holiday) => holiday.holidayDate >= today)
    .sort((a, b) => a.holidayDate.localeCompare(b.holidayDate))
    .slice(0, 4);
  const upcomingTravels = travels
    .filter((travel) => travel.status !== 'cancelled' && travel.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 4);
  const pendingDtr = periods.filter(
    (period) => period.status === 'draft' || period.status === 'reviewed',
  );
  const approvedDtr = periods.filter((period) => period.status === 'approved').length;
  const lockedDtr = periods.filter((period) => period.status === 'locked').length;
  const recentLeave = [...leaveApps]
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .slice(0, 4);

  const stats = [
    {
      label: 'Active employees',
      value: activeEmployees.length,
      hint: `${employees.length} total in roster`,
      icon: Users,
      tab: 'roster' as const,
    },
    {
      label: 'Leave awaiting action',
      value: submittedLeave.length,
      hint: `${approvedLeave.length} approved this year`,
      icon: FileText,
      tab: 'leave' as const,
    },
    {
      label: 'Upcoming travels',
      value: upcomingTravels.length,
      hint: `${travels.length} official travels recorded`,
      icon: Plane,
      tab: 'travels' as const,
    },
    {
      label: 'DTR needs attention',
      value: pendingDtr.length,
      hint: `${approvedDtr} approved · ${lockedDtr} locked`,
      icon: Cloud,
      tab: 'dtr' as const,
    },
  ];

  const actions = [
    { label: 'Add employee', tab: 'roster' as const, icon: Users, allowed: canWrite },
    { label: 'File leave', tab: 'leave' as const, icon: FileText, allowed: canWrite },
    { label: 'Record travel', tab: 'travels' as const, icon: Plane, allowed: canWrite },
    { label: 'Review DTR', tab: 'dtr' as const, icon: Cloud, allowed: true },
  ].filter((action) => action.allowed);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            School overview
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">{schoolName}</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {monthName(month)} {year} · signed in as {roleLabel(role)} ·{' '}
            {activeEmployees.length} active
            employees
          </p>
        </div>
        {loading && (
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Refreshing records…
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.label}
              type="button"
              onClick={() => onTabChange(stat.tab)}
              className="group rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {stat.label}
                </p>
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-100 text-slate-600 transition-colors group-hover:bg-slate-900 group-hover:text-white dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-white dark:group-hover:text-slate-900">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{stat.value}</p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{stat.hint}</p>
            </button>
          );
        })}
      </div>

      {actions.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Quick actions
            </p>
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Btn
                  key={action.label}
                  size="sm"
                  variant="soft"
                  onClick={() => onTabChange(action.tab)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {action.label}
                </Btn>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-semibold">Recent leave applications</h3>
            <Btn
              size="xs"
              variant="ghost"
              className="ml-auto"
              onClick={() => onTabChange('leave')}
            >
              Open leave <ArrowRight className="h-3 w-3" />
            </Btn>
          </div>
          {recentLeave.length === 0 ? (
            <EmptyLine>No leave applications recorded for {year}.</EmptyLine>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentLeave.map((application) => (
                <div key={application.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{application.employeeName}</p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {application.leaveCode} · {prettyDate(application.startDate)} –{' '}
                      {prettyDate(application.endDate)} · {application.days} day
                      {application.days === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Badge tone={statusTone(application.status)}>{application.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-semibold">DTR status</h3>
            <Btn
              size="xs"
              variant="ghost"
              className="ml-auto"
              onClick={() => onTabChange('dtr')}
            >
              Open DTR <ArrowRight className="h-3 w-3" />
            </Btn>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {monthName(month)} {year} saved periods
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
            {[
              ['Draft', periods.filter((period) => period.status === 'draft').length],
              ['Reviewed', periods.filter((period) => period.status === 'reviewed').length],
              ['Approved', approvedDtr],
              ['Locked', lockedDtr],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/40"
              >
                <p className="text-lg font-semibold tracking-tight">{value}</p>
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {label}
                </p>
              </div>
            ))}
          </div>
          {pendingDtr.length > 0 && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              {pendingDtr.length} period{pendingDtr.length === 1 ? '' : 's'} still need review or
              approval.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Plane className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-semibold">Upcoming official travels</h3>
            <Btn
              size="xs"
              variant="ghost"
              className="ml-auto"
              onClick={() => onTabChange('travels')}
            >
              Track travels <ArrowRight className="h-3 w-3" />
            </Btn>
          </div>
          {upcomingTravels.length === 0 ? (
            <EmptyLine>No upcoming official travels recorded.</EmptyLine>
          ) : (
            <div className="space-y-2">
              {upcomingTravels.map((travel) => (
                <div
                  key={travel.id}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {travel.destination}
                    </p>
                    <Badge tone={statusTone(travel.status)}>{travel.status}</Badge>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <MapPin className="h-3 w-3" />
                    {travel.employeeName} · {prettyDate(travel.startDate)} –{' '}
                    {prettyDate(travel.endDate)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-semibold">Upcoming holidays</h3>
            <Btn
              size="xs"
              variant="ghost"
              className="ml-auto"
              onClick={() => onTabChange('holidays')}
            >
              Open holidays <ArrowRight className="h-3 w-3" />
            </Btn>
          </div>
          {upcomingHolidays.length === 0 ? (
            <EmptyLine>No upcoming holidays recorded for {year}.</EmptyLine>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {upcomingHolidays.map((holiday) => (
                <div key={holiday.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-16 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {prettyDate(holiday.holidayDate)}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm">{holiday.name}</p>
                  <Badge>{holiday.type}</Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
