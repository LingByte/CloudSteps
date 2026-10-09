import Taro from '@tarojs/taro'
import {
  consumeCoachingLesson,
  endCoachingAppointment,
  startPracticeSession,
} from '../api/coaching'
import { authStore } from '../stores/authStore'
import { getTrainingStudent } from './trainingStudent'
import { isCoachRole } from './coachOnboarding'

export type PracticeBillingLink = {
  appointmentId: string
  owned: boolean
  studentId: string
  studentName: string
  startedAt: number
}

const BILLING_KEY = 'lb_practice_billing'

function normalizeId(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function getPracticeBilling(): PracticeBillingLink | null {
  try {
    const raw = Taro.getStorageSync(BILLING_KEY)
    if (!raw) return null
    const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<PracticeBillingLink>
    if (!parsed?.appointmentId) return null
    return {
      appointmentId: normalizeId(parsed.appointmentId),
      owned: parsed.owned !== false,
      studentId: normalizeId(parsed.studentId),
      studentName: String(parsed.studentName || ''),
      startedAt: Number(parsed.startedAt || Date.now()),
    }
  } catch {
    return null
  }
}

function setPracticeBilling(link: PracticeBillingLink | null) {
  if (link) Taro.setStorageSync(BILLING_KEY, JSON.stringify(link))
  else Taro.removeStorageSync(BILLING_KEY)
}

export function clearPracticeBilling() {
  setPracticeBilling(null)
}

export function canSyncPracticeBilling(): boolean {
  const state = authStore.getState()
  if (!state.isAuthenticated || !state.token || !isCoachRole(state.user?.role)) return false
  return Boolean(getTrainingStudent()?.id)
}

let ensureInFlight: Promise<PracticeBillingLink | null> | null = null

export function ensurePracticeBillingActive(
  plannedMinutes = 180,
  opts?: { force?: boolean; silent?: boolean },
): Promise<PracticeBillingLink | null> {
  const selectedStudent = getTrainingStudent()
  if (!canSyncPracticeBilling() || !selectedStudent?.id) {
    if (!opts?.silent && !selectedStudent?.id) Taro.showToast({ title: '请先选择学员', icon: 'none' })
    return Promise.resolve(null)
  }
  const student = selectedStudent
  const existing = getPracticeBilling()
  if (!opts?.force && existing?.appointmentId && existing.studentId === String(student.id)) {
    return Promise.resolve(existing)
  }
  if (ensureInFlight) return ensureInFlight

  ensureInFlight = (async () => {
    try {
      const res = await startPracticeSession({
        studentId: student.id,
        plannedMinutes: Math.max(1, Math.min(180, Math.round(plannedMinutes) || 180)),
      })
      if (res.code !== 200) {
        if (!opts?.silent) Taro.showToast({ title: res.msg || '开课失败', icon: 'none' })
        return existing?.studentId === String(student.id) ? existing : null
      }
      const appointmentId = normalizeId(res.data?.appointmentId ?? res.data?.appointment?.id)
      if (!appointmentId) {
        if (!opts?.silent) Taro.showToast({ title: '未返回课次信息', icon: 'none' })
        return existing
      }
      const latest = getPracticeBilling()
      const link: PracticeBillingLink = {
        appointmentId,
        owned: latest?.appointmentId === appointmentId ? latest.owned : res.data?.owned !== false,
        studentId: normalizeId(res.data?.studentId || student.id),
        studentName: res.data?.appointment?.students?.[0] || student.name || `学员 ${student.id}`,
        startedAt: latest?.appointmentId === appointmentId && latest.startedAt ? latest.startedAt : Date.now(),
      }
      setPracticeBilling(link)
      if (!res.data?.reused && !existing && !opts?.silent) {
        Taro.showToast({ title: `已开始计时：${link.studentName}`, icon: 'none' })
      }
      return link
    } catch (error) {
      if (existing?.studentId === String(student.id)) return existing
      if (!opts?.silent) {
        const msg = error && typeof error === 'object' && 'msg' in error ? String((error as { msg?: string }).msg) : '暂时无法开课'
        Taro.showToast({ title: msg, icon: 'none' })
      }
      return null
    } finally {
      ensureInFlight = null
    }
  })()

  return ensureInFlight
}

let finishInFlight: Promise<void> | null = null

export function finishPracticeBilling(link?: PracticeBillingLink | null): Promise<void> {
  if (finishInFlight) return finishInFlight
  const task = (async () => {
    const active = link ?? getPracticeBilling()
    if (!active?.appointmentId || !active.owned) {
      clearPracticeBilling()
      return
    }
    try {
      const res = await endCoachingAppointment(active.appointmentId)
      if (res.code !== 200) {
        Taro.showToast({ title: res.msg || '结算课次失败', icon: 'none' })
        if (String(res.msg || '').includes('不存在') || res.code === 2000) clearPracticeBilling()
        return
      }
      Taro.showToast({ title: `已结算：${active.studentName}`, icon: 'success' })
      clearPracticeBilling()
    } catch (error) {
      const msg = error && typeof error === 'object' && 'msg' in error ? String((error as { msg?: string }).msg) : '结算课次失败'
      Taro.showToast({ title: msg, icon: 'none' })
    } finally {
      finishInFlight = null
    }
  })()
  finishInFlight = task
  return task
}

export async function consumeScheduledStudentLesson(link?: PracticeBillingLink | null): Promise<void> {
  const active = link ?? getPracticeBilling()
  if (!active?.appointmentId || active.owned) return
  try {
    const res = await consumeCoachingLesson(active.appointmentId)
    if (res.code !== 200) Taro.showToast({ title: res.msg || '学员课时扣减失败', icon: 'none' })
  } catch (error) {
    const msg = error && typeof error === 'object' && 'msg' in error ? String((error as { msg?: string }).msg) : '学员课时扣减失败'
    Taro.showToast({ title: msg, icon: 'none' })
  }
}

export function stampLessonPracticeWindow(endAt = Date.now()) {
  const billing = getPracticeBilling()
  const startMs = billing?.startedAt ?? endAt
  Taro.setStorageSync('lb_lesson_practice_start', String(startMs))
  Taro.setStorageSync('lb_lesson_practice_end', String(endAt))
}
