import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { NavigationEnd, Router } from '@angular/router';
import { Chart, ChartTypeRegistry, registerables } from 'chart.js';
import { filter } from 'rxjs/operators';

import { SubjectsService } from '../../../services/subjects.service';
import { EventsService } from '../../../services/events/events.service';
import { ExamDoc, ExamsService } from '../../../services/exams.service';
import { StudyGuideDoc, StudyGuidesService } from '../../../services/study-guides.service';

Chart.register(...registerables);

type CalendarDay = {
  dayNumber: number | null;
  dateKey: string | null;
  inCurrentMonth: boolean;
  studied: boolean;
  isToday: boolean;
};

// Tipo helper para evitar conflictos de genéricos en Chart.js
type AnyChart = Chart<keyof ChartTypeRegistry, unknown[], unknown>;

@Component({
  selector: 'app-principal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './principal.html',
  styleUrls: ['./principal.css'],
})
export class Principal implements AfterViewInit, OnDestroy {
  @ViewChild('materiasCanvas') materiasCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('tiempoCanvas') tiempoCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('guiasCanvas') guiasCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('examenesCreadosCanvas') examenesCreadosCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('pendientesCanvas') pendientesCanvas!: ElementRef<HTMLCanvasElement>;

  currentStreak = 0;
  bestStreak = 0;
  weeklyTotalHours = 0;
  weeklyTotalMinutes = 0;
  todayStudyMinutes = 0;
  currentMonthLabel = '';
  calendarDays: CalendarDay[] = [];
  zeroCompletedSubjects: string[] = [];

  private isBrowser = false;
  // ✅ Fix: usar AnyChart en lugar de Chart sin genéricos
  private materiasChart?: AnyChart;
  private tiempoChart?: AnyChart;
  private guiasChart?: AnyChart;
  private examenesCreadosChart?: AnyChart;
  private pendientesChart?: AnyChart;
  private static pendingLabelPluginRegistered = false;
  private static barLabelPluginRegistered = false;
  private authUnsubscribe?: () => void;
  private navSub?: { unsubscribe: () => void };

  private readonly auth = inject(Auth);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly subjectsService = inject(SubjectsService);
  private readonly eventsService = inject(EventsService);
  private readonly examsService = inject(ExamsService);
  private readonly studyGuidesService = inject(StudyGuidesService);
  private readonly router = inject(Router);

  constructor() {
    const platformId = inject(PLATFORM_ID);
    this.isBrowser = isPlatformBrowser(platformId);
    this.currentMonthLabel = this.formatMonthLabel(new Date());
    this.calendarDays = this.buildCalendarDays([]);
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;

    const currentUid = this.auth.currentUser?.uid;
    if (currentUid) void this.loadDashboardData(currentUid);

    this.authUnsubscribe = onAuthStateChanged(this.auth, (user) => {
      this.zone.run(() => {
        if (!user) {
          this.currentStreak = 0;
          this.bestStreak = 0;
          this.weeklyTotalHours = 0;
          this.weeklyTotalMinutes = 0;
          this.todayStudyMinutes = 0;
          this.currentMonthLabel = this.formatMonthLabel(new Date());
          this.calendarDays = this.buildCalendarDays([]);
          this.zeroCompletedSubjects = [];
          this.crearGraficos([], [], [], [], [], [], [], [], []);
          this.cdr.detectChanges();
          return;
        }

        void this.loadDashboardData(user.uid);
      });
    });

    this.navSub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        if (this.router.url === '/dashboard') {
          const uid = this.auth.currentUser?.uid;
          if (uid) void this.loadDashboardData(uid);
        }
      });
  }

  private async loadDashboardData(uid: string): Promise<void> {
    const [subjects, metrics, exams, guides] = await Promise.all([
      this.subjectsService.getSubjectsForUser(uid).catch(() => []),
      this.eventsService.getDashboardMetrics().catch(() => ({
        weeklyStudyHours: [0, 0, 0, 0, 0, 0, 0],
        weeklyStudyMinutes: [0, 0, 0, 0, 0, 0, 0],
        topSubjects: [],
        currentStreak: 0,
        bestStreak: 0,
        studyDateKeys: [],
      })),
      this.examsService.getMyExams().catch(() => []),
      this.studyGuidesService.getMyStudyGuides().catch(() => []),
    ]);
    const metricsWeeklyMinutes = metrics.weeklyStudyMinutes.map((minutes) => Number(minutes) || 0);

    const nameById = new Map<string, string>();
    for (const subject of subjects) {
      const id = String(subject?.id ?? '');
      if (!id) continue;
      const name = String(subject?.name ?? 'Materia').trim() || 'Materia';
      nameById.set(id, name);
    }

    const examDriven = this.buildExamDrivenMetrics(exams, nameById);
    const createdExamsDriven = this.buildCreatedExamMetrics(exams, nameById);
    const guidesDriven = this.buildGuideMetrics(guides, nameById);
    const pendingDriven = this.buildPendingExamMetrics(exams, nameById, subjects);
    const mergedWeeklyMinutes = metricsWeeklyMinutes.map(
      (minutes, idx) => minutes + (examDriven.weeklyMinutes[idx] ?? 0),
    );
    const mergedWeeklyHoursChart = mergedWeeklyMinutes.map((minutes) => {
      if (!minutes) return 0;
      const hours = minutes / 60;
      return Math.round(hours * 100) / 100;
    });

    const topLabels = examDriven.topSubjects.map((item) => item.label);
    const topValues = examDriven.topSubjects.map((item) => item.consultations);
    const createdExamLabels = createdExamsDriven.topSubjects.map((item) => item.label);
    const createdExamValues = createdExamsDriven.topSubjects.map((item) => item.total);
    const guideLabels = guidesDriven.topSubjects.map((item) => item.label);
    const guideValues = guidesDriven.topSubjects.map((item) => item.total);
    this.zeroCompletedSubjects = pendingDriven.zeroCompletedLabels;
    const pendingLabels = pendingDriven.topSubjects.length
      ? pendingDriven.topSubjects.map((e) => e.label)
      : ['Sin pendientes'];
    const pendingValues = pendingDriven.topSubjects.length
      ? pendingDriven.topSubjects.map((e) => e.pending)
      : [1];
    const combinedStudyDateKeys = [...new Set([...metrics.studyDateKeys, ...examDriven.studyDateKeys])];
    const combinedStreak = this.computeStreakFromDateKeys(combinedStudyDateKeys);

    this.currentStreak = combinedStreak.currentStreak;
    this.bestStreak = combinedStreak.bestStreak;
    this.weeklyTotalHours = Math.round(mergedWeeklyMinutes.reduce((acc, n) => acc + n, 0) / 60 * 10) / 10;
    this.weeklyTotalMinutes = mergedWeeklyMinutes.reduce((acc, n) => acc + n, 0);
    this.todayStudyMinutes = mergedWeeklyMinutes[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1] ?? 0;
    this.currentMonthLabel = this.formatMonthLabel(new Date());
    this.calendarDays = this.buildCalendarDays(combinedStudyDateKeys);

    this.crearGraficos(
      topLabels,
      topValues,
      guideLabels,
      guideValues,
      createdExamLabels,
      createdExamValues,
      pendingLabels,
      pendingValues,
      mergedWeeklyHoursChart,
    );
    this.cdr.detectChanges();
  }

  private buildExamDrivenMetrics(
    exams: ExamDoc[],
    nameById: Map<string, string>,
  ): {
    topSubjects: Array<{ label: string; consultations: number }>;
    weeklyMinutes: number[];
    studyDateKeys: string[];
  } {
    const countByLabel = new Map<string, number>();
    const weeklyMinutes = [0, 0, 0, 0, 0, 0, 0];
    const studyDateKeys = new Set<string>();

    const now = new Date();
    const monday = this.getMonday(now);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    for (const exam of exams) {
      if (!exam.results?.completed) continue;

      const subjectId = String(exam.subjectId ?? '').trim();
      const topicLabel = String(exam.topic ?? '').trim();
      const label = subjectId
        ? ((nameById.get(subjectId) ?? topicLabel) || 'Materia')
        : (topicLabel || 'Sin materia');

      const current = countByLabel.get(label) ?? 0;
      const attemptsFromField = Number(exam.completedAttempts) || 0;
      const attemptsFromHistory = Array.isArray(exam.completedHistory) ? exam.completedHistory.length : 0;
      const attempts = Math.max(attemptsFromField, attemptsFromHistory, 1);
      countByLabel.set(label, current + attempts);

      const duration = Number(exam.exam?.durationMinutes) || 15;
      if (duration <= 0) continue;

      if (attemptsFromHistory > 0) {
        const durations = Array.isArray(exam.completedDurations) ? exam.completedDurations : [];
        for (let i = 0; i < (exam.completedHistory ?? []).length; i++) {
          const attemptDate = exam.completedHistory?.[i];
          if (attemptDate) studyDateKeys.add(this.toDateKey(attemptDate));
          if (!attemptDate || attemptDate < monday || attemptDate > sunday) continue;
          const idx = attemptDate.getDay() === 0 ? 6 : attemptDate.getDay() - 1;
          const durationForAttempt = Number(durations[i]) || duration;
          weeklyMinutes[idx] += durationForAttempt;
        }
        continue;
      }

      const completedAt = this.toDate(exam.results?.completedAt) ?? exam.updatedAt ?? exam.createdAt;
      if (completedAt) studyDateKeys.add(this.toDateKey(completedAt));
      if (!completedAt || completedAt < monday || completedAt > sunday) continue;
      const idx = completedAt.getDay() === 0 ? 6 : completedAt.getDay() - 1;
      weeklyMinutes[idx] += duration * attempts;
    }

    const topSubjects = [...countByLabel.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, consultations]) => ({ label, consultations }));

    return { topSubjects, weeklyMinutes, studyDateKeys: [...studyDateKeys].sort() };
  }

  private buildGuideMetrics(
    guides: StudyGuideDoc[],
    nameById: Map<string, string>,
  ): { topSubjects: Array<{ label: string; total: number }> } {
    const countByLabel = new Map<string, number>();

    for (const guide of guides) {
      const subjectId = String(guide.subjectId ?? '').trim();
      const topicLabel = String(guide.topic ?? '').trim();
      const label = subjectId
        ? ((nameById.get(subjectId) ?? topicLabel) || 'Materia')
        : (topicLabel || 'Sin materia');

      countByLabel.set(label, (countByLabel.get(label) ?? 0) + 1);
    }

    const topSubjects = [...countByLabel.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, total]) => ({ label, total }));

    return { topSubjects };
  }

  private buildCreatedExamMetrics(
    exams: ExamDoc[],
    nameById: Map<string, string>,
  ): { topSubjects: Array<{ label: string; total: number }> } {
    const countByLabel = new Map<string, number>();

    for (const exam of exams) {
      const subjectId = String(exam.subjectId ?? '').trim();
      const topicLabel = String(exam.topic ?? '').trim();
      const label = subjectId
        ? ((nameById.get(subjectId) ?? topicLabel) || 'Materia')
        : (topicLabel || 'Sin materia');

      countByLabel.set(label, (countByLabel.get(label) ?? 0) + 1);
    }

    const topSubjects = [...countByLabel.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, total]) => ({ label, total }));

    return { topSubjects };
  }

  private buildPendingExamMetrics(
    exams: ExamDoc[],
    nameById: Map<string, string>,
    subjects: any[],
  ): {
    topSubjects: Array<{ label: string; pending: number }>;
    zeroCompletedLabels: string[];
    entries: Array<{ label: string; pending: number; completed: number; created: number }>;
  } {
    const createdByLabel = new Map<string, number>();
    const completedByLabel = new Map<string, number>();

    for (const subject of subjects) {
      const subjectId = String(subject?.id ?? '').trim();
      const name = String(subject?.name ?? '').trim();
      if (!subjectId) continue;
      const label = name || 'Materia';
      createdByLabel.set(label, 0);
      completedByLabel.set(label, 0);
    }

    for (const exam of exams) {
      const subjectId = String(exam.subjectId ?? '').trim();
      const topicLabel = String(exam.topic ?? '').trim();
      const label = subjectId
        ? ((nameById.get(subjectId) ?? topicLabel) || 'Materia')
        : (topicLabel || 'Sin materia');

      createdByLabel.set(label, (createdByLabel.get(label) ?? 0) + 1);

      const attemptsFromField = Number(exam.completedAttempts) || 0;
      const attemptsFromHistory = Array.isArray(exam.completedHistory) ? exam.completedHistory.length : 0;
      const attempts = Math.max(attemptsFromField, attemptsFromHistory, 0);
      if (attempts > 0) {
        completedByLabel.set(label, (completedByLabel.get(label) ?? 0) + attempts);
      }
    }

    const entries: Array<{ label: string; pending: number; completed: number; created: number }> = [];
    for (const [label, created] of createdByLabel.entries()) {
      const completed = completedByLabel.get(label) ?? 0;
      const pending = Math.max(0, created - completed);
      entries.push({ label, pending, completed, created });
    }

    const zeroCompletedLabels = entries
      .filter((e) => e.completed === 0 && e.created > 0)
      .map((e) => e.label);

    const topSubjects = entries
      .filter((e) => e.pending > 0)
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 5)
      .map((e) => ({ label: e.label, pending: e.pending }));

    return { topSubjects, zeroCompletedLabels, entries };
  }

  private toDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;

    const maybeTs = value as { toDate?: () => Date };
    if (typeof maybeTs.toDate === 'function') {
      const d = maybeTs.toDate();
      return d instanceof Date ? d : null;
    }
    return null;
  }

  private getMonday(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private toDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private fromDateKey(dateKey: string): Date {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private computeStreakFromDateKeys(dateKeys: string[]): { currentStreak: number; bestStreak: number } {
    const eligibleDateKeys = [...new Set(dateKeys)].sort();

    if (!eligibleDateKeys.length) return { currentStreak: 0, bestStreak: 0 };

    const eligibleSet = new Set(eligibleDateKeys);
    let currentStreak = 0;
    let cursor = new Date();
    while (eligibleSet.has(this.toDateKey(cursor))) {
      currentStreak++;
      cursor = this.addDays(cursor, -1);
    }

    let bestStreak = 1;
    let run = 1;
    for (let i = 1; i < eligibleDateKeys.length; i++) {
      const prev = this.fromDateKey(eligibleDateKeys[i - 1]);
      const current = this.fromDateKey(eligibleDateKeys[i]);
      const diffDays = Math.round((current.getTime() - prev.getTime()) / 86400000);
      if (diffDays === 1) run++;
      else run = 1;
      if (run > bestStreak) bestStreak = run;
    }

    return { currentStreak, bestStreak };
  }

  private buildCalendarDays(studyDateKeys: string[]): CalendarDay[] {
    const currentMonth = new Date();
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const monthStartOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const todayKey = this.toDateKey(new Date());
    const studiedSet = new Set(studyDateKeys);
    const days: CalendarDay[] = [];

    for (let i = 0; i < monthStartOffset; i++) {
      days.push({
        dayNumber: null,
        dateKey: null,
        inCurrentMonth: false,
        studied: false,
        isToday: false,
      });
    }

    for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber++) {
      const day = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayNumber);
      const dateKey = this.toDateKey(day);
      days.push({
        dayNumber,
        dateKey,
        inCurrentMonth: true,
        studied: studiedSet.has(dateKey),
        isToday: dateKey === todayKey,
      });
    }

    return days;
  }

  private formatMonthLabel(date: Date): string {
    const monthName = date.toLocaleDateString('es-GT', { month: 'long' });
    const safeMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    return `${safeMonthName} ${date.getFullYear()}`;
  }

  formatDuration(minutes: number): string {
    const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
    const hours = Math.floor(safeMinutes / 60);
    const remainingMinutes = safeMinutes % 60;

    if (hours <= 0) return `${remainingMinutes} minutos`;
    if (remainingMinutes <= 0) return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;

    return `${hours} ${hours === 1 ? 'hora' : 'horas'} ${remainingMinutes} minutos`;
  }

  private crearGraficos(
    materiaLabels: string[],
    materiaValues: number[],
    guideLabels: string[],
    guideValues: number[],
    createdExamLabels: string[],
    createdExamValues: number[],
    pendingLabels: string[],
    pendingValues: number[],
    weeklyHours?: number[],
  ): void {
    this.materiasChart?.destroy();
    this.tiempoChart?.destroy();
    this.guiasChart?.destroy();
    this.examenesCreadosChart?.destroy();
    this.pendientesChart?.destroy();

    const safeMateriaLabels = materiaLabels.length ? materiaLabels : ['Sin datos'];
    const safeMateriaValues = materiaValues.length ? materiaValues : [0];
    const safeGuideLabels = guideLabels.length ? guideLabels : ['Sin datos'];
    const safeGuideValues = guideValues.length ? guideValues : [0];
    const safeCreatedExamLabels = createdExamLabels.length ? createdExamLabels : ['Sin datos'];
    const safeCreatedExamValues = createdExamValues.length ? createdExamValues : [0];
    const safePendingLabels = pendingLabels.length ? pendingLabels : ['Sin pendientes'];
    const safePendingValues = pendingValues.length ? pendingValues : [0];
    const pendingColors = this.buildColorScale(safePendingLabels.length);
    const safeWeeklyHours = weeklyHours?.length ? weeklyHours : [0, 0, 0, 0, 0, 0, 0];
    const maxWeeklyHours = Math.max(...safeWeeklyHours);
    const suggestedMaxWeeklyHours = maxWeeklyHours < 1 ? 1 : Math.ceil(maxWeeklyHours * 10) / 10;

    this.registerPendingLabelPlugin();
    this.registerBarLabelPlugin();

    // ✅ Se usa 'as AnyChart' para resolver incompatibilidad de genéricos de Chart.js
    this.materiasChart = new Chart(this.materiasCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: safeMateriaLabels,
        datasets: [
          {
            label: 'Examenes realizados',
            data: safeMateriaValues,
            backgroundColor: '#E4002B',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { display: false } },
        },
      },
    }) as AnyChart;

    this.guiasChart = new Chart(this.guiasCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: safeGuideLabels,
        datasets: [
          {
            label: 'Guias generadas',
            data: safeGuideValues,
            backgroundColor: '#F59E0B',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { display: false } },
        },
      },
    }) as AnyChart;

    this.examenesCreadosChart = new Chart(this.examenesCreadosCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: safeCreatedExamLabels,
        datasets: [
          {
            label: 'Examenes creados',
            data: safeCreatedExamValues,
            backgroundColor: '#2563EB',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        plugins: { legend: { position: 'bottom' } },
        indexAxis: 'y',
        scales: {
          x: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { display: false } },
        },
      },
    }) as AnyChart;

    this.pendientesChart = new Chart(this.pendientesCanvas.nativeElement, {
      type: 'doughnut',
      data: {
        labels: safePendingLabels,
        datasets: [
          {
            label: 'Examenes pendientes',
            data: safePendingValues,
            backgroundColor: pendingColors,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
      },
    }) as AnyChart;

    this.tiempoChart = new Chart(this.tiempoCanvas.nativeElement, {
      type: 'line',
      data: {
        labels: ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'],
        datasets: [
          {
            label: 'Horas de estudio',
            data: safeWeeklyHours,
            borderColor: '#8B0D21',
            backgroundColor: 'rgba(139,13,33,0.2)',
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const value = Number(ctx.parsed?.y ?? 0);
                if (value > 0 && value < 0.5) {
                  const minutes = Math.max(1, Math.round(value * 60));
                  return `Tiempo de estudio: ${minutes} min`;
                }
                return `Horas de estudio: ${value.toFixed(1)} h`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            suggestedMax: suggestedMaxWeeklyHours,
            ticks: {
              stepSize: 0.5,
              callback: (value) => `${Number(value).toFixed(1)} h`,
            },
            grid: { display: false },
          },
          x: { grid: { display: false } },
        },
      },
    }) as AnyChart;
  }

  ngOnDestroy(): void {
    this.authUnsubscribe?.();
    this.navSub?.unsubscribe();
    this.materiasChart?.destroy();
    this.guiasChart?.destroy();
    this.examenesCreadosChart?.destroy();
    this.pendientesChart?.destroy();
    this.tiempoChart?.destroy();
  }

  private buildColorScale(count: number): string[] {
    const palette = ['#6bb6e5', '#f28db5', '#4ecfb4'];
    if (count <= 1) return [palette[0]];
    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
      colors.push(palette[i % palette.length]);
    }
    return colors;
  }

  private registerPendingLabelPlugin(): void {
    if (Principal.pendingLabelPluginRegistered) return;

    const plugin = {
      id: 'pendingValueLabels',
      afterDatasetDraw: (chart: AnyChart, args: any, pluginOptions: any) => {
        const chartType = (chart.config as { type?: string }).type;
        if (chartType !== 'doughnut') return;
        const { ctx } = chart;
        const dataset = chart.data.datasets[args.index];
        if (!dataset) return;
        const meta = chart.getDatasetMeta(args.index);
        const color = pluginOptions?.color || '#0f172a';
        const fontSize = pluginOptions?.fontSize || 11;
        const fontWeight = pluginOptions?.fontWeight || 500;
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = `${fontWeight} ${fontSize}px 'Segoe UI', Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        meta.data.forEach((element: any, idx: number) => {
          const value = dataset.data[idx];
          if (value == null) return;
          const pos = element.tooltipPosition();
          ctx.fillText(String(value), pos.x, pos.y);
        });
        ctx.restore();
      },
    };

    Chart.register(plugin);
    Principal.pendingLabelPluginRegistered = true;
  }

  private registerBarLabelPlugin(): void {
    if (Principal.barLabelPluginRegistered) return;

    const plugin = {
      id: 'barValueLabels',
      afterDatasetDraw: (chart: AnyChart, args: any, pluginOptions: any) => {
        const chartType = (chart.config as { type?: string }).type;
        if (chartType !== 'bar') return;
        const { ctx } = chart;
        const dataset = chart.data.datasets[args.index];
        if (!dataset) return;
        const meta = chart.getDatasetMeta(args.index);
        const color = pluginOptions?.color || '#0f172a';
        const fontSize = pluginOptions?.fontSize || 11;
        const fontWeight = pluginOptions?.fontWeight || 500;
        const indexAxis = (chart.config.options as { indexAxis?: string } | undefined)?.indexAxis;
        const isHorizontal = indexAxis === 'y';
        const chartArea = chart.chartArea;
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = `${fontWeight} ${fontSize}px 'Segoe UI', Roboto, sans-serif`;
        ctx.textAlign = isHorizontal ? 'left' : 'center';
        ctx.textBaseline = isHorizontal ? 'middle' : 'bottom';
        meta.data.forEach((element: any, idx: number) => {
          const value = dataset.data[idx];
          if (value == null) return;
          const pos = element.tooltipPosition();
          if (isHorizontal) {
            const label = String(value);
            const padding = 6;
            let x = pos.x + padding;
            let align: CanvasTextAlign = 'left';
            if (x > chartArea.right - padding) {
              x = pos.x - padding;
              align = 'right';
            }
            ctx.textAlign = align;
            ctx.fillText(label, x, pos.y);
          } else {
            ctx.fillText(String(value), pos.x, pos.y - 6);
          }
        });
        ctx.restore();
      },
    };

    Chart.register(plugin);
    Principal.barLabelPluginRegistered = true;
  }
}