// Client for the Cloudflare Worker API. Production is same-origin through the
// Pages proxy; local dev uses Vite's `/api` proxy to `wrangler dev` on 8787.

const env = import.meta.env as Record<string, string | undefined>
const API_BASE = (env.VITE_API_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  })

  if (res.status === 204) return undefined as T

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    let message = ''
    if (data && typeof data === 'object') {
      if ('error' in data) message = String((data as { error: unknown }).error)
      else if ('message' in data) message = String((data as { message: unknown }).message)
    }
    throw new ApiError(message || res.statusText || 'Request failed', res.status)
  }

  return data as T
}

function json(body: unknown): RequestInit {
  return { body: JSON.stringify(body) }
}

/* ── Auth ─────────────────────────────────────────────────────────────── */

export type CloudUser = {
  id: string
  name: string
  email: string
  image?: string | null
}

export type CloudSession = {
  user: CloudUser
  session: unknown
  isSystemAdmin: boolean
}

export async function getSession(): Promise<CloudSession | null> {
  try {
    return await request<CloudSession>('/api/me', {
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return null
  }
}

export async function signIn(email: string, password: string) {
  return request<{ user: CloudUser }>('/api/auth/sign-in/email', {
    method: 'POST',
    ...json({ email, password }),
  })
}

export async function signUp(name: string, email: string, password: string) {
  return request<{ user: CloudUser }>('/api/auth/sign-up/email', {
    method: 'POST',
    ...json({ name, email, password }),
  })
}

export async function signOut(): Promise<void> {
  await request('/api/auth/sign-out', { method: 'POST', ...json({}) })
}

/* ── Schools ──────────────────────────────────────────────────────────── */

export type CloudSchool = {
  id: string
  name: string
  schoolCode: string | null
  division: string | null
  region: string | null
  role: string
}

export async function listSchools(): Promise<CloudSchool[]> {
  const data = await request<{ schools: CloudSchool[] }>('/api/schools')
  return data.schools
}

export async function createSchool(input: {
  name: string
  schoolCode?: string | null
  division?: string | null
  region?: string | null
}): Promise<CloudSchool> {
  const data = await request<{ school: CloudSchool }>('/api/schools', {
    method: 'POST',
    ...json(input),
  })
  return data.school
}

export type SchoolCatalogEntry = {
  id: string
  name: string
  schoolCode: string | null
  division: string | null
  region: string | null
}

export type CloudMembershipStatus = 'pending' | 'active' | 'rejected' | 'suspended'

export type CloudMembership = {
  id: string
  schoolId: string
  schoolName: string
  schoolCode: string | null
  role: string
  status: CloudMembershipStatus
  createdAt: number
}

export async function listSchoolCatalog(): Promise<SchoolCatalogEntry[]> {
  const data = await request<{ schools: SchoolCatalogEntry[] }>('/api/schools/catalog')
  return data.schools
}

export async function listMyMemberships(): Promise<CloudMembership[]> {
  const data = await request<{ memberships: CloudMembership[] }>('/api/onboarding/memberships')
  return data.memberships
}

export async function requestSchoolAccess(schoolId: string): Promise<CloudMembership> {
  const data = await request<{ membership: CloudMembership }>('/api/onboarding/join', {
    method: 'POST',
    ...json({ schoolId }),
  })
  return data.membership
}

export type AdminMembership = CloudMembership & {
  userId: string
  name: string
  email: string
}

export type AdminSchool = Omit<CloudSchool, 'role'> & {
  memberCount: number
  pendingCount: number
  employeeCount: number
  dtrPendingCount: number
  leavePendingCount: number
  createdAt: number
  updatedAt: number
}

export type AdminOverview = {
  schools: number
  activeMembers: number
  pendingRequests: number
  activeEmployees: number
  pendingLeave: number
  dtrDraft: number
  dtrReviewed: number
  dtrApproved: number
  dtrLocked: number
  auditEvents: number
  auditRecent: number
}

export type AdminActivityEntry = {
  id: string
  schoolId: string
  schoolName: string | null
  actorUserId: string
  actorName: string | null
  actorEmail: string | null
  action: string
  entityType: string
  entityId: string | null
  meta: unknown
  createdAt: number
}

export type AdminSchoolMember = {
  id: string
  userId: string
  name: string
  email: string
  role: string
  status: CloudMembershipStatus
  createdAt: number
}

export type AdminSchoolDetail = {
  school: AdminSchool & {
    dtrDraft: number
    dtrReviewed: number
    dtrApproved: number
    dtrLocked: number
  }
  members: AdminSchoolMember[]
  activity: AdminActivityEntry[]
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const data = await request<{ overview: AdminOverview }>('/api/admin/overview')
  return data.overview
}

export type AdminActivityQuery = {
  limit?: number
  offset?: number
  before?: number
  q?: string
  action?: string
  schoolId?: string
  from?: number
  to?: number
}

export async function listAdminActivityPage(
  opts: AdminActivityQuery = {},
): Promise<{ entries: AdminActivityEntry[]; total: number }> {
  const params = new URLSearchParams()
  if (opts.limit) params.set('limit', String(opts.limit))
  if (opts.offset) params.set('offset', String(opts.offset))
  if (opts.before) params.set('before', String(opts.before))
  if (opts.q) params.set('q', opts.q)
  if (opts.action) params.set('action', opts.action)
  if (opts.schoolId) params.set('schoolId', opts.schoolId)
  if (opts.from) params.set('from', String(opts.from))
  if (opts.to) params.set('to', String(opts.to))
  const query = params.toString()
  const data = await request<{ entries: AdminActivityEntry[]; total?: number }>(
    `/api/admin/activity${query ? `?${query}` : ''}`,
  )
  return { entries: data.entries, total: data.total ?? data.entries.length }
}

export async function listAdminActivity(
  opts: AdminActivityQuery = {},
): Promise<AdminActivityEntry[]> {
  const { entries } = await listAdminActivityPage(opts)
  return entries
}

export async function getAdminSchoolDetail(schoolId: string): Promise<AdminSchoolDetail> {
  return request<AdminSchoolDetail>(`/api/admin/schools/${encodeURIComponent(schoolId)}`)
}

export async function listAdminMemberships(
  status?: CloudMembershipStatus,
): Promise<AdminMembership[]> {
  const query = status ? `?status=${status}` : ''
  const data = await request<{ memberships: AdminMembership[] }>(
    `/api/admin/memberships${query}`,
  )
  return data.memberships
}

export async function updateAdminMembership(
  membershipId: string,
  status: Exclude<CloudMembershipStatus, 'pending'>,
): Promise<AdminMembership> {
  const data = await request<{ membership: AdminMembership }>(
    `/api/admin/memberships/${membershipId}`,
    { method: 'PATCH', ...json({ status }) },
  )
  return data.membership
}

export async function listAdminSchools(): Promise<AdminSchool[]> {
  const data = await request<{ schools: AdminSchool[] }>('/api/admin/schools')
  return data.schools
}

/* ── Employees ────────────────────────────────────────────────────────── */

export type CloudEmployee = {
  id: string
  schoolId: string
  employeeNo: string | null
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  position: string | null
  isActive: boolean
}

export type EmployeeInput = {
  firstName: string
  lastName: string
  middleName?: string | null
  suffix?: string | null
  employeeNo?: string | null
  position?: string | null
}

export async function listEmployees(
  schoolId: string,
  opts: { search?: string; includeInactive?: boolean } = {},
): Promise<CloudEmployee[]> {
  const params = new URLSearchParams()
  if (opts.search) params.set('search', opts.search)
  if (opts.includeInactive) params.set('includeInactive', 'true')
  const query = params.toString()
  const data = await request<{ employees: CloudEmployee[] }>(
    `/api/schools/${schoolId}/employees${query ? `?${query}` : ''}`,
  )
  return data.employees
}

export async function createEmployee(
  schoolId: string,
  input: EmployeeInput,
): Promise<CloudEmployee> {
  const data = await request<{ employee: CloudEmployee }>(
    `/api/schools/${schoolId}/employees`,
    { method: 'POST', ...json(input) },
  )
  return data.employee
}

export async function updateEmployee(
  schoolId: string,
  employeeId: string,
  input: Partial<EmployeeInput> & { isActive?: boolean },
): Promise<CloudEmployee> {
  const data = await request<{ employee: CloudEmployee }>(
    `/api/schools/${schoolId}/employees/${employeeId}`,
    { method: 'PATCH', ...json(input) },
  )
  return data.employee
}

/* ── Holidays ─────────────────────────────────────────────────────────── */

export type CloudHoliday = {
  id: string
  schoolId: string | null
  holidayDate: string
  name: string
  type: 'regular' | 'special' | 'local'
  createdAt?: number
}

export async function listHolidays(schoolId: string, year: number): Promise<CloudHoliday[]> {
  const data = await request<{ holidays: CloudHoliday[] }>(
    `/api/schools/${schoolId}/holidays?year=${year}`,
  )
  return data.holidays
}

export async function createHoliday(
  schoolId: string,
  input: { holidayDate: string; name: string; type: CloudHoliday['type'] },
): Promise<CloudHoliday> {
  const data = await request<{ holiday: CloudHoliday }>(
    `/api/schools/${schoolId}/holidays`,
    { method: 'POST', ...json(input) },
  )
  return data.holiday
}

export async function deleteHoliday(schoolId: string, holidayId: string): Promise<void> {
  await request(`/api/schools/${schoolId}/holidays/${holidayId}`, { method: 'DELETE' })
}

/* ── Leave ────────────────────────────────────────────────────────────── */

export type CloudLeaveType = {
  id: string
  schoolId: string | null
  code: string
  name: string
  requiresCredits: boolean
}

export type CloudLeaveApplication = {
  id: string
  employeeId: string
  employeeName: string
  leaveTypeId: string
  leaveCode: string
  leaveName: string
  startDate: string
  endDate: string
  days: number
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled'
  remarks: string | null
  createdAt: number
}

export async function listLeaveTypes(schoolId: string): Promise<CloudLeaveType[]> {
  const data = await request<{ leaveTypes: CloudLeaveType[] }>(
    `/api/schools/${schoolId}/leave-types`,
  )
  return data.leaveTypes
}

export async function createLeaveType(
  schoolId: string,
  input: { code: string; name: string; requiresCredits?: boolean },
): Promise<CloudLeaveType> {
  const data = await request<{ leaveType: CloudLeaveType }>(
    `/api/schools/${schoolId}/leave-types`,
    { method: 'POST', ...json(input) },
  )
  return data.leaveType
}

export async function listLeaveApplications(
  schoolId: string,
  opts: { year?: number; status?: string; employeeId?: string } = {},
): Promise<CloudLeaveApplication[]> {
  const params = new URLSearchParams()
  if (opts.year) params.set('year', String(opts.year))
  if (opts.status) params.set('status', opts.status)
  if (opts.employeeId) params.set('employeeId', opts.employeeId)
  const query = params.toString()
  const data = await request<{ applications: CloudLeaveApplication[] }>(
    `/api/schools/${schoolId}/leave-applications${query ? `?${query}` : ''}`,
  )
  return data.applications
}

export async function createLeaveApplication(
  schoolId: string,
  input: {
    employeeId: string
    leaveTypeId: string
    startDate: string
    endDate: string
    days: number
    remarks?: string | null
    status?: 'draft' | 'submitted'
  },
): Promise<CloudLeaveApplication> {
  const data = await request<{ application: CloudLeaveApplication }>(
    `/api/schools/${schoolId}/leave-applications`,
    { method: 'POST', ...json(input) },
  )
  return data.application
}

export async function updateLeaveApplication(
  schoolId: string,
  applicationId: string,
  input: { status?: string; remarks?: string | null },
): Promise<CloudLeaveApplication> {
  const data = await request<{ application: CloudLeaveApplication }>(
    `/api/schools/${schoolId}/leave-applications/${applicationId}`,
    { method: 'PATCH', ...json(input) },
  )
  return data.application
}

/* ── Official travels ─────────────────────────────────────────────────── */

export type CloudTravelStatus = 'planned' | 'approved' | 'completed' | 'cancelled';

export type CloudOfficialTravel = {
  id: string
  schoolId: string
  employeeId: string
  employeeName: string
  referenceNo: string | null
  destination: string
  purpose: string | null
  startDate: string
  endDate: string
  days: number
  status: CloudTravelStatus
  remarks: string | null
  createdAt: number
  updatedAt: number
}

export type OfficialTravelInput = {
  employeeId: string
  referenceNo?: string | null
  destination: string
  purpose?: string | null
  startDate: string
  endDate: string
  days: number
  status?: CloudTravelStatus
  remarks?: string | null
}

export async function listOfficialTravels(
  schoolId: string,
  opts: { year?: number; employeeId?: string; status?: CloudTravelStatus } = {},
): Promise<CloudOfficialTravel[]> {
  const params = new URLSearchParams()
  if (opts.year) params.set('year', String(opts.year))
  if (opts.employeeId) params.set('employeeId', opts.employeeId)
  if (opts.status) params.set('status', opts.status)
  const query = params.toString()
  const data = await request<{ travels: CloudOfficialTravel[] }>(
    `/api/schools/${schoolId}/travels${query ? `?${query}` : ''}`,
  )
  return data.travels
}

export async function createOfficialTravel(
  schoolId: string,
  input: OfficialTravelInput,
): Promise<CloudOfficialTravel> {
  const data = await request<{ travel: CloudOfficialTravel }>(
    `/api/schools/${schoolId}/travels`,
    { method: 'POST', ...json(input) },
  )
  return data.travel
}

export async function updateOfficialTravel(
  schoolId: string,
  travelId: string,
  input: Partial<OfficialTravelInput>,
): Promise<CloudOfficialTravel> {
  const data = await request<{ travel: CloudOfficialTravel }>(
    `/api/schools/${schoolId}/travels/${travelId}`,
    { method: 'PATCH', ...json(input) },
  )
  return data.travel
}

export async function deleteOfficialTravel(
  schoolId: string,
  travelId: string,
): Promise<void> {
  await request(`/api/schools/${schoolId}/travels/${travelId}`, { method: 'DELETE' })
}

/* ── DTR ──────────────────────────────────────────────────────────────── */

export type CloudDtrPeriod = {
  id: string
  schoolId: string
  employeeId: string
  employeeName: string
  year: number
  month: number
  status: 'draft' | 'reviewed' | 'approved' | 'locked'
  lockedAt: number | null
}

export type DtrDayInput = {
  workDate: string
  amIn: string | null
  amOut: string | null
  pmIn: string | null
  pmOut: string | null
  dayType: 'work' | 'holiday' | 'leave' | 'weekend' | 'half_day'
  remarks: string | null
  source: 'import' | 'manual' | 'correction'
}

export async function listDtrPeriods(
  schoolId: string,
  opts: { year?: number; month?: number; employeeId?: string } = {},
): Promise<CloudDtrPeriod[]> {
  const params = new URLSearchParams()
  if (opts.year) params.set('year', String(opts.year))
  if (opts.month) params.set('month', String(opts.month))
  if (opts.employeeId) params.set('employeeId', opts.employeeId)
  const query = params.toString()
  const data = await request<{ periods: CloudDtrPeriod[] }>(
    `/api/schools/${schoolId}/dtr-periods${query ? `?${query}` : ''}`,
  )
  return data.periods
}

export async function createDtrPeriod(
  schoolId: string,
  input: { employeeId: string; year: number; month: number },
): Promise<CloudDtrPeriod> {
  const data = await request<{ period: CloudDtrPeriod }>(
    `/api/schools/${schoolId}/dtr-periods`,
    { method: 'POST', ...json(input) },
  )
  return data.period
}

export async function updateDtrPeriod(
  schoolId: string,
  periodId: string,
  status: CloudDtrPeriod['status'],
): Promise<CloudDtrPeriod> {
  const data = await request<{ period: CloudDtrPeriod }>(
    `/api/schools/${schoolId}/dtr-periods/${periodId}`,
    { method: 'PATCH', ...json({ status }) },
  )
  return data.period
}

export async function saveDtrDays(
  schoolId: string,
  periodId: string,
  days: DtrDayInput[],
): Promise<void> {
  await request(`/api/schools/${schoolId}/dtr-periods/${periodId}/days`, {
    method: 'PUT',
    ...json({ days }),
  })
}
