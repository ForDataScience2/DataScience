import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Auth } from '@angular/fire/auth';
import {
  Firestore, collection, getDocs, query,
  where, Timestamp, DocumentData,
} from '@angular/fire/firestore';

export interface DashboardKpi {
  title: string; value: string; rawValue: number;
  change: string; positive: boolean; icon: string; miniLabel: string;
}

export interface AlertRow {
  uid: string; displayName: string; email: string;
  career: string; subject: string; module: string;
  riskLevel: 'Alto' | 'Medio' | 'Bajo';
  scorePct: number; scoreLabel: string;
  examName: string; difficulty: string; attempts: number;
}

export interface DashboardCharts {
  riskByCareer:           { labels: string[]; values: number[] };
  difficultyDistribution: { basico: number; intermedio: number; avanzado: number };
  weeklyActivity:         { labels: string[]; studySeconds: number[]; examMinutes: number[] };
  radar: {
    scoreAvg: number; completionRate: number; difficultyIndex: number;
    avgAttempts: number; studyConsistency: number; guidesRate: number; _max: number;
  };
  activityVsRisk: Array<{ x: number; y: number }>;
  riskByModule:   { labels: string[]; alto: number[]; medio: number[]; bajo: number[] };
}

export interface DashboardInsight {
  text: string; type: 'warning' | 'info' | 'success';
}

export interface DashboardStats {
  kpis: DashboardKpi[]; charts: DashboardCharts;
  alerts: AlertRow[]; insights: DashboardInsight[];
  meta: { generatedAt: string; month: string };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const ts = v as { toDate?: () => Date; seconds?: number };
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  if (typeof v === 'string') { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  return null;
}
function dayIdx(d: Date) { return d.getDay(); }
function riskLevel(pct: number): 'Alto' | 'Medio' | 'Bajo' {
  return pct < 60 ? 'Alto' : pct < 80 ? 'Medio' : 'Bajo';
}
function startOfMonth(d: Date)     { return new Date(d.getFullYear(), d.getMonth(), 1); }
function startOfPrevMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() - 1, 1); }
function calcChange(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? '+100%' : '0%';
  const p = ((cur - prev) / prev) * 100;
  return `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
}

// ──────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DashboardService {
  // ✅ Usando inject() en lugar de constructor injection para AngularFire
  private firestore = inject(Firestore);
  private auth      = inject(Auth);

  private cache: DashboardStats | null = null;
  private cacheTime = 0;
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private ts(d: Date) { return Timestamp.fromDate(d); }

  // ─── Método principal ──────────────────────────────────────────────────────

  async getStats(forceRefresh = false): Promise<DashboardStats> {
    const emptyCharts: DashboardCharts = {
      riskByCareer:           { labels: [], values: [] },
      difficultyDistribution: { basico: 0, intermedio: 0, avanzado: 0 },
      weeklyActivity:         { labels: [], studySeconds: [], examMinutes: [] },
      radar:                  { scoreAvg: 0, completionRate: 0, difficultyIndex: 0, avgAttempts: 0, studyConsistency: 0, guidesRate: 0, _max: 10 },
      activityVsRisk:         [],
      riskByModule:           { labels: [], alto: [], medio: [], bajo: [] },
    };
    const empty: DashboardStats = {
      kpis: [], charts: emptyCharts, alerts: [], insights: [],
      meta: { generatedAt: new Date().toISOString(), month: '' }
    };

    if (!this.isBrowser) return empty;

    const nowTs = Date.now();
    if (!forceRefresh && this.cache && nowTs - this.cacheTime < this.cacheTime) return this.cache;

    try {
      await this.auth.authStateReady();

      const now    = new Date();
      const tsThis = this.ts(startOfMonth(now));
      const tsPrev = this.ts(startOfPrevMonth(now));

      // ── Fetch base en paralelo ────────────────────────────────────────────
      const [examsSnap, subjectsSnap, usersSnap, guidesSnap, dailySnap, eventsSnap] =
        await Promise.all([
          getDocs(collection(this.firestore, 'exams')),
          getDocs(collection(this.firestore, 'subjects')),
          getDocs(collection(this.firestore, 'users')),
          getDocs(collection(this.firestore, 'studyGuides')),
          getDocs(collection(this.firestore, 'userDailyStats')),
          getDocs(query(
            collection(this.firestore, 'studyEvents'),
            where('createdAt', '>=', this.ts(new Date(now.getTime() - 7 * 86400000)))
          )),
        ]);

      // Mapas
      const subMap  = new Map<string, DocumentData>();
      subjectsSnap.docs.forEach(d => subMap.set(d.id, d.data()));

      const userMap = new Map<string, DocumentData>();
      usersSnap.docs.forEach(d => userMap.set(d.id, d.data()));

      const allExams     = examsSnap.docs.map(d => ({ id: d.id, data: d.data() }));
      const completedRaw = allExams.filter(e => e.data['results']?.['completed'] === true);
      const completed    = completedRaw.map(e => e.data);
      const allExamData  = allExams.map(e => e.data);

      const totalExams     = allExams.length;
      const completedExams = completed.length;
      const totalGuides    = guidesSnap.size;
      const totalSubjects  = subjectsSnap.size;
      const totalUsers     = usersSnap.size;

      // ── Conteos mensuales (sobre datos ya cargados) ───────────────────────
      const examsThis = allExamData.filter(e => {
        const d = toDate(e['createdAt']); return d ? d >= startOfMonth(now) : false;
      }).length;
      const examsPrev = allExamData.filter(e => {
        const d = toDate(e['createdAt']); return d ? d >= startOfPrevMonth(now) && d < startOfMonth(now) : false;
      }).length;
      const guidesThis = guidesSnap.docs.filter(d => {
        const dt = toDate(d.data()['createdAt']); return dt ? dt >= startOfMonth(now) : false;
      }).length;
      const guidesPrev = guidesSnap.docs.filter(d => {
        const dt = toDate(d.data()['createdAt']); return dt ? dt >= startOfPrevMonth(now) && dt < startOfMonth(now) : false;
      }).length;
      const subjectsThis = subjectsSnap.docs.filter(d => {
        const dt = toDate(d.data()['createdAt']); return dt ? dt >= startOfMonth(now) : false;
      }).length;
      const subjectsPrev = subjectsSnap.docs.filter(d => {
        const dt = toDate(d.data()['createdAt']); return dt ? dt >= startOfPrevMonth(now) && dt < startOfMonth(now) : false;
      }).length;
      const usersThis = usersSnap.docs.filter(d => {
        const dt = toDate(d.data()['createdAt']); return dt ? dt >= startOfMonth(now) : false;
      }).length;
      const usersPrev = usersSnap.docs.filter(d => {
        const dt = toDate(d.data()['createdAt']); return dt ? dt >= startOfPrevMonth(now) && dt < startOfMonth(now) : false;
      }).length;

      // ── Gráfica 1: Riesgo por carrera ─────────────────────────────────────
      const careerCount = new Map<string, number>();
      for (const e of allExamData) {
        const sid    = (e['subjectId'] as string | undefined)?.trim();
        const career = sid ? (subMap.get(sid)?.['career'] as string | undefined)?.trim() : undefined;
        if (!career) continue;
        careerCount.set(career, (careerCount.get(career) ?? 0) + 1);
      }
      const careerSorted = [...careerCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      const riskByCareer = { labels: careerSorted.map(([l]) => l), values: careerSorted.map(([, v]) => v) };

      // ── Gráfica 2: Dificultad ─────────────────────────────────────────────
      let basico = 0, intermedio = 0, avanzado = 0;
      for (const e of allExamData) {
        if (e['difficulty'] === 'basico') basico++;
        else if (e['difficulty'] === 'intermedio') intermedio++;
        else if (e['difficulty'] === 'avanzado') avanzado++;
      }
      const difficultyDistribution = { basico, intermedio, avanzado };

      // ── Gráfica 3: Actividad semanal ──────────────────────────────────────
      const ago7 = new Date(now); ago7.setDate(now.getDate() - 6); ago7.setHours(0, 0, 0, 0);
      const secByDay = new Array(7).fill(0);
      const minByDay = new Array(7).fill(0);

      eventsSnap.docs.forEach(d => {
        const ev = d.data();
        const dt = toDate(ev['createdAt']);
        if (!dt) return;
        secByDay[(dayIdx(dt) + 6) % 7] += Number(ev['durationSeconds'] ?? 0);
      });
      for (const e of completed) {
        const hist: unknown[]  = Array.isArray(e['completedHistory'])   ? e['completedHistory']   : [];
        const durs: number[]   = Array.isArray(e['completedDurations']) ? e['completedDurations'] : [];
        const fb               = Number(e['exam']?.['durationMinutes'] ?? 15);
        hist.forEach((raw, i) => {
          const dt = toDate(raw);
          if (!dt || dt < ago7) return;
          const dur = Number(durs[i] ?? fb);
          if (dur > 0) minByDay[(dayIdx(dt) + 6) % 7] += dur;
        });
      }
      const weeklyActivity = {
        labels: ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'],
        studySeconds: secByDay, examMinutes: minByDay,
      };

      // ── Gráfica 4: Radar ──────────────────────────────────────────────────
      const ago30 = new Date(now); ago30.setDate(now.getDate() - 30);
      const ago30Key = ago30.toISOString().slice(0, 10);

      let scoreSum = 0, scoreN = 0;
      for (const e of completed) {
        const s = Number(e['results']?.['score'] ?? 0);
        const t = Number(e['results']?.['totalPoints'] ?? e['exam']?.['totalPoints'] ?? 100);
        if (t > 0) { scoreSum += (s / t) * 100; scoreN++; }
      }
      const scoreAvg = scoreN > 0 ? Math.round(scoreSum / scoreN) : 0;
      const completionRate = totalExams > 0 ? Math.round((completedExams / totalExams) * 100) : 0;

      const diffMap: Record<string, number> = { basico: 33, intermedio: 66, avanzado: 100 };
      let dSum = 0, dN = 0;
      for (const e of allExamData) { const v = diffMap[(e['difficulty'] as string) ?? '']; if (v) { dSum += v; dN++; } }
      const difficultyIndex = dN > 0 ? Math.round(dSum / dN) : 0;

      let aSum = 0, aN = 0;
      for (const e of allExamData) {
        const a = Math.max(
          Number(e['completedAttempts'] ?? 0),
          Array.isArray(e['completedHistory']) ? e['completedHistory'].length : 0
        );
        if (a > 0) { aSum += a; aN++; }
      }
      const avgAttempts = aN > 0 ? Math.min(Math.round(40 + (aSum / aN) * 12), 100) : 0;

      const activeDays = new Set<string>();
      dailySnap.docs.forEach(d => {
        const k = d.data()['dateKey'] as string | undefined;
        if (k && k >= ago30Key) activeDays.add(k);
      });
      const studyConsistency = Math.min(Math.round((activeDays.size / 30) * 100), 100);
      const guidesRate = totalSubjects > 0 ? Math.min(Math.round((totalGuides / totalSubjects) * 100), 100) : 0;

      const radarVals = [scoreAvg, completionRate, difficultyIndex, avgAttempts, studyConsistency, guidesRate];
      const radar = { scoreAvg, completionRate, difficultyIndex, avgAttempts, studyConsistency, guidesRate, _max: Math.max(...radarVals, 10) };

      // ── Gráfica 5: Scatter ────────────────────────────────────────────────
      const actByUid    = new Map<string, number>();
      const totByUid    = new Map<string, number>();
      const failedByUid = new Map<string, number>();
      dailySnap.docs.forEach(d => {
        const uid = d.data()['uid'] as string | undefined;
        if (uid) actByUid.set(uid, (actByUid.get(uid) ?? 0) + Number(d.data()['studySeconds'] ?? 0));
      });
      for (const e of allExamData) {
        const uid = e['uid'] as string | undefined;
        if (!uid || !e['results']?.['completed']) continue;
        totByUid.set(uid, (totByUid.get(uid) ?? 0) + 1);
        const s = Number(e['results']?.['score'] ?? 0);
        const t = Number(e['results']?.['totalPoints'] ?? 100);
        if (t > 0 && s / t < 0.6) failedByUid.set(uid, (failedByUid.get(uid) ?? 0) + 1);
      }
      const activityVsRisk: Array<{ x: number; y: number }> = [];
      for (const [uid, sec] of actByUid.entries()) {
        const tot    = totByUid.get(uid)    ?? 0;
        const failed = failedByUid.get(uid) ?? 0;
        const risk   = tot > 0 ? Math.round((failed / tot) * 100) : 50;
        const am     = Math.min(Math.round(sec / 60), 100);
        if (am > 0) activityVsRisk.push({ x: am, y: risk });
      }

      // ── Gráfica 6: Riesgo por módulo ──────────────────────────────────────
      const altoMod  = new Map<string, number>();
      const medioMod = new Map<string, number>();
      const bajoMod  = new Map<string, number>();
      for (const e of completed) {
        const sid = (e['subjectId'] as string | undefined)?.trim();
        const mod = sid ? (subMap.get(sid)?.['module'] as string | undefined)?.trim() : undefined;
        if (!mod) continue;
        const s = Number(e['results']?.['score'] ?? 0);
        const t = Number(e['results']?.['totalPoints'] ?? 100);
        const p = t > 0 ? (s / t) * 100 : 0;
        if (p < 60)      altoMod.set(mod,  (altoMod.get(mod)  ?? 0) + 1);
        else if (p < 80) medioMod.set(mod, (medioMod.get(mod) ?? 0) + 1);
        else             bajoMod.set(mod,  (bajoMod.get(mod)  ?? 0) + 1);
      }
      const allMods    = new Set([...altoMod.keys(), ...medioMod.keys(), ...bajoMod.keys()]);
      const modSorted  = [...allMods]
        .map(m => ({ m, t: (altoMod.get(m) ?? 0) + (medioMod.get(m) ?? 0) + (bajoMod.get(m) ?? 0) }))
        .sort((a, b) => b.t - a.t).slice(0, 6);
      const riskByModule = {
        labels: modSorted.map(s => s.m),
        alto:   modSorted.map(s => altoMod.get(s.m)  ?? 0),
        medio:  modSorted.map(s => medioMod.get(s.m) ?? 0),
        bajo:   modSorted.map(s => bajoMod.get(s.m)  ?? 0),
      };

      // ── Alertas ───────────────────────────────────────────────────────────
      const alertRows: AlertRow[] = [];
      for (const { data: e } of completedRaw) {
        const s      = Number(e['results']?.['score']       ?? 0);
        const t      = Number(e['results']?.['totalPoints'] ?? e['exam']?.['totalPoints'] ?? 100);
        const pct    = t > 0 ? Math.round((s / t) * 100) : 0;
        const uid    = (e['uid']       as string | undefined)?.trim() ?? '';
        const sid    = (e['subjectId'] as string | undefined)?.trim() ?? '';
        const sub    = subMap.get(sid);
        const user   = userMap.get(uid);

        const displayName =
          (user?.['displayName'] as string | undefined)?.trim() ||
          [user?.['firstName'], user?.['lastName']].filter(Boolean).join(' ').trim() ||
          (user?.['email'] as string | undefined)?.split('@')[0]?.trim() ||
          `Usuario ${uid.slice(0, 6)}`;

        const email = (user?.['email'] as string | undefined)?.trim() ?? '';

        const fromField   = Number(e['completedAttempts'] ?? 0);
        const fromHistory = Array.isArray(e['completedHistory']) ? e['completedHistory'].length : 0;

        alertRows.push({
          uid, displayName, email,
          career:     (sub?.['career'] as string | undefined)?.trim() ?? 'Sin carrera',
          subject:    (sub?.['name']   as string | undefined)?.trim() ?? (e['topic'] as string | undefined)?.trim() ?? 'Sin materia',
          module:     (sub?.['module'] as string | undefined)?.trim() ?? '',
          riskLevel:  riskLevel(pct),
          scorePct:   pct,
          scoreLabel: `${s}/${t}`,
          examName:   (e['name'] as string | undefined) ?? '',
          difficulty: (e['difficulty'] as string | undefined) ?? 'intermedio',
          attempts:   Math.max(fromField, fromHistory, 1),
        });
      }
      const alerts = [
        ...alertRows.filter(r => r.riskLevel === 'Alto').sort((a, b) => a.scorePct - b.scorePct).slice(0, 5),
        ...alertRows.filter(r => r.riskLevel === 'Bajo').sort((a, b) => b.scorePct - a.scorePct).slice(0, 5),
      ];

      // ── Duración promedio ─────────────────────────────────────────────────
      let totalDur = 0, durN = 0;
      for (const d of completed) {
        const arr: number[] = Array.isArray(d['completedDurations']) ? d['completedDurations'] : [];
        for (const v of arr) { if (typeof v === 'number' && v > 0) { totalDur += v; durN++; } }
      }
      const avgDuration = durN > 0 ? Math.round(totalDur / durN) : 0;
      const avgGPM      = totalSubjects > 0 ? parseFloat((totalGuides / totalSubjects).toFixed(1)) : 0;

      // ── Activos este mes ──────────────────────────────────────────────────
      const activeUids = new Set<string>();
      const prevUids   = new Set<string>();
      for (const e of allExamData) {
        const uid = e['uid'] as string | undefined;
        if (!uid) continue;
        const dt = toDate(e['createdAt']);
        if (!dt) continue;
        if (dt >= startOfMonth(now)) activeUids.add(uid);
        else if (dt >= startOfPrevMonth(now)) prevUids.add(uid);
      }
      for (const d of guidesSnap.docs) {
        const uid = d.data()['uid'] as string | undefined;
        if (!uid) continue;
        const dt = toDate(d.data()['createdAt']);
        if (!dt) continue;
        if (dt >= startOfMonth(now)) activeUids.add(uid);
        else if (dt >= startOfPrevMonth(now)) prevUids.add(uid);
      }

      // ── Insights dinámicos ────────────────────────────────────────────────
      const insights: DashboardInsight[] = [];
      const crMap = new Map<string, number>();
      for (const a of alerts.filter(r => r.riskLevel === 'Alto'))
        crMap.set(a.career, (crMap.get(a.career) ?? 0) + 1);
      const topC = [...crMap.entries()].sort((a, b) => b[1] - a[1])[0];
      if (topC)
        insights.push({ text: `La carrera "${topC[0]}" concentra el mayor número de alertas de riesgo alto (${topC[1]} exámenes críticos).`, type: 'warning' });

      insights.push(completionRate < 50
        ? { text: `Solo el ${completionRate}% de los exámenes han sido completados. Se recomienda implementar recordatorios.`, type: 'warning' }
        : { text: `El ${completionRate}% de los exámenes han sido completados. Mantener el ritmo con microevaluaciones.`, type: 'info' }
      );

      const td = basico + intermedio + avanzado;
      if (td > 0) {
        const dom = avanzado >= intermedio && avanzado >= basico ? `avanzado (${avanzado})`
          : intermedio >= basico ? `intermedio (${intermedio})` : `básico (${basico})`;
        insights.push({ text: `Nivel de dificultad predominante: ${dom}. Los exámenes avanzados muestran mayor correlación con riesgo alto.`, type: 'info' });
      }

      if (riskByModule.labels.length > 0) {
        const mi = riskByModule.alto.indexOf(Math.max(...riskByModule.alto));
        if ((riskByModule.alto[mi] ?? 0) > 0)
          insights.push({ text: `El módulo "${riskByModule.labels[mi]}" tiene ${riskByModule.alto[mi]} exámenes en riesgo alto. Priorizar intervención.`, type: 'warning' });
      }

      const bajos = alerts.filter(r => r.riskLevel === 'Bajo');
      if (bajos.length > 0) {
        const avg = Math.round(bajos.reduce((s, r) => s + r.scorePct, 0) / bajos.length);
        insights.push({ text: `Los ${bajos.length} estudiantes con mejor rendimiento tienen score promedio de ${avg}%. Usar sus estrategias como modelo.`, type: 'success' });
      }

      const charts: DashboardCharts = {
        riskByCareer, difficultyDistribution, weeklyActivity,
        radar, activityVsRisk, riskByModule,
      };

      const stats: DashboardStats = {
        kpis: [
          { title: 'Estudiantes registrados', value: totalUsers.toLocaleString('es-HN'),      rawValue: totalUsers,      change: calcChange(usersThis, usersPrev),                    positive: usersThis >= usersPrev,         icon: '🧑‍🎓', miniLabel: `${usersThis} este mes` },
          { title: 'Exámenes creados',        value: totalExams.toLocaleString('es-HN'),      rawValue: totalExams,      change: calcChange(examsThis, examsPrev),                    positive: examsThis >= examsPrev,         icon: '📝',   miniLabel: `${examsThis} este mes` },
          { title: 'Guías de estudio',        value: totalGuides.toLocaleString('es-HN'),     rawValue: totalGuides,     change: calcChange(guidesThis, guidesPrev),                  positive: guidesThis >= guidesPrev,       icon: '📖',   miniLabel: `${guidesThis} este mes` },
          { title: 'Materias activas',        value: totalSubjects.toLocaleString('es-HN'),   rawValue: totalSubjects,   change: calcChange(subjectsThis, subjectsPrev),              positive: subjectsThis >= subjectsPrev,   icon: '📚',   miniLabel: `${subjectsThis} este mes` },
          { title: 'Tasa de completación',    value: `${completionRate}%`,                    rawValue: completionRate,  change: 'Promedio',                                         positive: true,                           icon: '🎯',   miniLabel: `${completedExams}/${totalExams} completados` },
          { title: 'Duración prom. examen',   value: avgDuration > 0 ? `${avgDuration} min` : '—', rawValue: avgDuration, change: 'Promedio',                                      positive: true,                           icon: '⏱️',  miniLabel: `${durN} registros` },
          { title: 'Guías por materia',       value: avgGPM.toString(),                       rawValue: avgGPM,          change: 'Promedio',                                         positive: true,                           icon: '📊',   miniLabel: `${totalGuides}/${totalSubjects}` },
          { title: 'Activos este mes',        value: activeUids.size.toLocaleString('es-HN'), rawValue: activeUids.size, change: calcChange(activeUids.size, prevUids.size),          positive: activeUids.size >= prevUids.size, icon: '🔥', miniLabel: `${prevUids.size} mes anterior` },
        ],
        charts, alerts, insights: insights.slice(0, 5),
        meta: { generatedAt: now.toISOString(), month: now.toLocaleString('es-HN', { month: 'long', year: 'numeric' }) },
      };

      this.cache = stats; this.cacheTime = Date.now();
      return stats;

    } catch (err) {
      console.error('DashboardService.getStats error:', err);
      throw err;
    }
  }
}