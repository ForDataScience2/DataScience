import {
  AfterViewInit, ChangeDetectorRef, Component,
  Inject, NgZone, OnDestroy, OnInit, PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import {
  AlertRow, DashboardCharts, DashboardInsight,
  DashboardKpi, DashboardService
} from './services/dashboar.service';

Chart.register(...registerables);

const CAREER_COLORS = [
  'rgba(99,102,241,0.82)',  'rgba(168,85,247,0.82)',
  'rgba(236,72,153,0.82)',  'rgba(14,165,233,0.82)',
  'rgba(34,197,94,0.82)',   'rgba(249,115,22,0.82)',
];

@Component({
  selector: 'app-dash-board-general',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dash-board-general.html',
  styleUrls: ['./dash-board-general.css'],
})
export class DashBoardGeneral implements OnInit, AfterViewInit, OnDestroy {
  loading     = false;
  error       = '';
  lastUpdated = '';
  kpis: DashboardKpi[]         = [];
  alerts: AlertRow[]            = [];
  insights: DashboardInsight[]  = [];

  // ── Datos para filtros (guardamos labels localmente para el onClick) ────────
  private careerLabels: string[]  = [];
  private moduleLabels: string[]  = [];
  private moduleAlto:  number[]   = [];
  private moduleMedio: number[]   = [];
  private moduleBajo:  number[]   = [];

  // ── Filtro activo ──────────────────────────────────────────────────────────
  activeFilter: { type: 'career' | 'risk' | 'module'; value: string; label: string } | null = null;

  get filteredAlerts(): AlertRow[] {
    if (!this.activeFilter) return this.alerts;
    const f = this.activeFilter;
    return this.alerts.filter(a => {
      if (f.type === 'risk')    return a.riskLevel === f.value;
      if (f.type === 'career')  return a.career    === f.value;
      if (f.type === 'module')  return a.module    === f.value;
      return true;
    });
  }

  clearFilter(): void {
    this.activeFilter = null;
    this.cdr.detectChanges();
  }

  private isBrowser  = false;
  private chartsData: DashboardCharts | null = null;
  private charts     = new Map<string, Chart>();

  constructor(
    private dashboardService: DashboardService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void      { if (this.isBrowser) this.loadStats(); }
  ngAfterViewInit(): void {}
  ngOnDestroy(): void   { this.destroyCharts(); }

  // ─── Carga ─────────────────────────────────────────────────────────────────

  async loadStats(forceRefresh = false): Promise<void> {
    if (!this.isBrowser || this.loading) return;
    this.loading = true; this.error = '';
    this.cdr.detectChanges();
    try {
      const stats      = await this.dashboardService.getStats(forceRefresh);
      this.kpis        = stats.kpis;
      this.chartsData  = stats.charts;
      this.alerts      = stats.alerts;
      this.insights    = stats.insights;
      this.lastUpdated = this.fmtDate(stats.meta.generatedAt);

      // Guardar labels para filtros
      this.careerLabels = stats.charts.riskByCareer.labels;
      this.moduleLabels = stats.charts.riskByModule.labels;
      this.moduleAlto   = stats.charts.riskByModule.alto;
      this.moduleMedio  = stats.charts.riskByModule.medio;
      this.moduleBajo   = stats.charts.riskByModule.bajo;

      this.ngZone.runOutsideAngular(() => setTimeout(() => this.renderCharts(), 50));
    } catch (e: any) {
      console.error('loadStats error:', e);
      this.error = 'No se pudieron cargar las estadísticas del panel. Revisa la consola.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private fmtDate(iso: string): string {
    return new Date(iso).toLocaleString('es-HN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  isStaticChange(v: string): boolean {
    return ['—', '0%', 'Promedio', 'Sin sesión'].includes(v);
  }

  getRiskClass(risk: string): string {
    return risk === 'Alto' ? 'risk-high' : risk === 'Medio' ? 'risk-medium' : 'risk-low';
  }

  getInsightIcon(type: string): string {
    return type === 'warning' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
  }

  getInsightClass(type: string): string {
    return `insight-${type}`;
  }

  getDiffLabel(d: string): string {
    return d === 'basico' ? 'Básico' : d === 'avanzado' ? 'Avanzado' : 'Intermedio';
  }

  // ─── Filtro centralizado ───────────────────────────────────────────────────

  private setFilter(type: 'career' | 'risk' | 'module', value: string, label: string): void {
    this.ngZone.run(() => {
      if (this.activeFilter?.value === value && this.activeFilter?.type === type) {
        this.activeFilter = null;   // toggle off
      } else {
        this.activeFilter = { type, value, label };
      }
      this.cdr.detectChanges();
    });
  }

  // ─── Chart helpers ─────────────────────────────────────────────────────────

  private destroyCharts(): void { this.charts.forEach(c => c.destroy()); this.charts.clear(); }

  private destroyChart(id: string): void {
    const c = this.charts.get(id); if (c) { c.destroy(); this.charts.delete(id); }
  }

  private makeChart(id: string, config: any): void {
    if (!this.isBrowser) return;
    const canvas = document.getElementById(id) as HTMLCanvasElement | null;
    if (!canvas) { console.warn('Canvas not found:', id); return; }
    this.destroyChart(id);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.charts.set(id, new Chart(ctx, config));
  }

  private renderCharts(): void {
    this.createRiskByCareerChart();
    this.createDifficultyChart();
    this.createWeeklyActivityChart();
    this.createPerformanceRadarChart();
    this.createActivityVsRiskChart();
    this.createRiskByModuleChart();
  }

  private tt() {
    return {
      backgroundColor: 'rgba(15,23,42,0.95)', titleColor: '#fff',
      bodyColor: '#dbeafe', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1,
    };
  }
  private ll() { return { color: '#dbeafe', font: { family: 'Inter', size: 12 } }; }

  // ─── Gráfica 1: Riesgo por carrera ────────────────────────────────────────

  private createRiskByCareerChart(): void {
    const labels = this.chartsData?.riskByCareer.labels.length
      ? this.chartsData.riskByCareer.labels
      : ['Ingeniería', 'Derecho', 'Psicología', 'Administración', 'Medicina'];
    const values = this.chartsData?.riskByCareer.values.length
      ? this.chartsData.riskByCareer.values : [24, 16, 18, 11, 9];

    this.makeChart('riskByCareerChart', {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Exámenes por carrera', data: values,
          backgroundColor: labels.map((_, i) => CAREER_COLORS[i % CAREER_COLORS.length]),
          borderRadius: 14, borderSkipped: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        onClick: (_evt: any, elements: any[]) => {
          if (!elements.length) return;
          const label = labels[elements[0].index];
          this.setFilter('career', label, `Carrera: ${label}`);
        },
        plugins: {
          legend: { labels: this.ll() },
          tooltip: { ...this.tt(), callbacks: { label: (c: any) => ` ${c.parsed.y} exámenes — click para filtrar` } },
        },
        scales: {
          x: { ticks: { color: '#bcd0ee' }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: '#bcd0ee', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.08)' } },
        },
      },
    });
  }

  // ─── Gráfica 2: Dificultad ─────────────────────────────────────────────────

  private createDifficultyChart(): void {
    const d     = this.chartsData?.difficultyDistribution;
    const total = (d?.basico ?? 0) + (d?.intermedio ?? 0) + (d?.avanzado ?? 0);
    const data  = total > 0 ? [d!.avanzado, d!.intermedio, d!.basico] : [32, 44, 24];
    // índice 0=Alta, 1=Media, 2=Baja
    const riskMap: Record<number, string> = { 0: 'Alto', 1: 'Medio', 2: 'Bajo' };

    this.makeChart('difficultyChart', {
      type: 'doughnut',
      data: {
        labels: ['Alta', 'Media', 'Baja'],
        datasets: [{
          data,
          backgroundColor: ['rgba(239,68,68,0.85)', 'rgba(250,204,21,0.85)', 'rgba(34,197,94,0.85)'],
          borderColor: 'rgba(15,23,42,0.9)', borderWidth: 3, hoverOffset: 10,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        onClick: (_evt: any, elements: any[]) => {
          if (!elements.length) return;
          const riskVal = riskMap[elements[0].index];
          if (riskVal) this.setFilter('risk', riskVal, `Riesgo: ${riskVal}`);
        },
        plugins: {
          legend: { position: 'bottom', labels: { ...this.ll(), padding: 16, usePointStyle: true } },
          tooltip: {
            ...this.tt(),
            callbacks: {
              label: (c: any) => {
                const pct = total > 0 ? Math.round((c.parsed / total) * 100) : 0;
                return ` ${c.parsed} exámenes (${pct}%) — click para filtrar`;
              },
            },
          },
        },
      },
    });
  }

  // ─── Gráfica 3: Actividad semanal ─────────────────────────────────────────

  private createWeeklyActivityChart(): void {
    const w      = this.chartsData?.weeklyActivity;
    const labels = w?.labels.length ? w.labels : ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const sMin   = (w?.studySeconds ?? new Array(7).fill(0)).map((s: number) => Math.round(s / 60));
    const eMin   = w?.examMinutes ?? new Array(7).fill(0);
    const hasD   = [...sMin, ...eMin].some((v: number) => v > 0);

    this.makeChart('weeklyActivityChart', {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Minutos de estudio',
            data: hasD ? sMin : [120,190,170,220,250,140,90],
            fill: true, tension: 0.35,
            borderColor: 'rgba(59,130,246,1)', backgroundColor: 'rgba(59,130,246,0.18)',
            pointBackgroundColor: '#fff', pointRadius: 4, pointHoverRadius: 6,
          },
          ...(hasD ? [{
            label: 'Minutos en exámenes', data: eMin, fill: true, tension: 0.35,
            borderColor: 'rgba(168,85,247,1)', backgroundColor: 'rgba(168,85,247,0.12)',
            pointBackgroundColor: '#fff', pointRadius: 4, pointHoverRadius: 6,
          }] : []),
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: this.ll() },
          tooltip: { ...this.tt(), callbacks: { label: (c: any) => ` ${c.parsed.y} min` } },
        },
        scales: {
          x: { ticks: { color: '#bcd0ee' }, grid: { color: 'rgba(255,255,255,0.06)' } },
          y: { beginAtZero: true, ticks: { color: '#bcd0ee', callback: (v: any) => `${v} min` }, grid: { color: 'rgba(255,255,255,0.08)' } },
        },
      },
    });
  }

  // ─── Gráfica 4: Radar ─────────────────────────────────────────────────────

  private createPerformanceRadarChart(): void {
    const r    = this.chartsData?.radar;
    const hasD = r && Object.entries(r).filter(([k]) => k !== '_max').some(([, v]) => (v as number) > 0);
    const data = hasD
      ? [r!.scoreAvg, r!.completionRate, r!.difficultyIndex, r!.avgAttempts, r!.studyConsistency, r!.guidesRate]
      : [68, 80, 66, 52, 40, 60];

    const rawMax   = hasD ? r!._max : 80;
    const maxScale = Math.min(Math.ceil(rawMax / 25) * 25, 100);
    const stepSize = maxScale <= 50 ? 10 : 25;

    this.makeChart('performanceRadarChart', {
      type: 'radar',
      data: {
        labels: ['Score prom.','Completación','Dificultad','Intentos','Consistencia','Guías/Materia'],
        datasets: [{
          label: 'Desempeño promedio', data,
          borderColor: 'rgba(168,85,247,1)', backgroundColor: 'rgba(168,85,247,0.20)',
          pointBackgroundColor: '#fff', pointBorderColor: 'rgba(168,85,247,1)',
          pointRadius: 4, pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: this.ll() },
          tooltip: {
            ...this.tt(),
            callbacks: {
              label: (c: any) => {
                const v = c.parsed.r;
                const d: Record<number, string> = {
                  0: `${v}% score`, 1: `${v}% completados`,
                  2: v <= 33 ? 'Dif. baja' : v <= 66 ? 'Dif. media' : 'Dif. alta',
                  3: `Intentos: ${v}`, 4: `${v}% días activos`, 5: `${v}% guías/materia`,
                };
                return ` ${d[c.dataIndex] ?? v}`;
              },
            },
          },
        },
        scales: {
          r: {
            min: 0, max: maxScale,
            angleLines: { color: 'rgba(255,255,255,0.1)' }, grid: { color: 'rgba(255,255,255,0.1)' },
            pointLabels: { color: '#dbeafe', font: { size: 11 } },
            ticks: { color: '#bcd0ee', backdropColor: 'transparent', stepSize, callback: (v: any) => `${v}` },
          },
        },
      },
    });
  }

  // ─── Gráfica 5: Scatter ────────────────────────────────────────────────────

  private createActivityVsRiskChart(): void {
    const pts  = this.chartsData?.activityVsRisk ?? [];
    const hasD = pts.length > 0;
    const data = hasD ? pts : [
      {x:15,y:90},{x:25,y:82},{x:40,y:68},{x:55,y:54},{x:70,y:32},{x:85,y:18},
    ];

    this.makeChart('activityVsRiskChart', {
      type: 'scatter',
      data: {
        datasets: [{
          label: hasD ? 'Actividad vs riesgo (real)' : 'Actividad vs riesgo (ejemplo)',
          data, backgroundColor: 'rgba(236,72,153,0.75)', pointRadius: 6, pointHoverRadius: 8,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: this.ll() },
          tooltip: { ...this.tt(), callbacks: { label: (c: any) => ` Actividad: ${c.parsed.x} min | Riesgo: ${c.parsed.y}%` } },
        },
        scales: {
          x: { title: { display: true, text: 'Actividad (min)', color: '#dbeafe' }, ticks: { color: '#bcd0ee' }, grid: { color: 'rgba(255,255,255,0.08)' } },
          y: { title: { display: true, text: 'Riesgo (%)', color: '#dbeafe' }, min: 0, max: 100, ticks: { color: '#bcd0ee', callback: (v: any) => `${v}%` }, grid: { color: 'rgba(255,255,255,0.08)' } },
        },
      },
    });
  }

  // ─── Gráfica 6: Riesgo por módulo ─────────────────────────────────────────

  private createRiskByModuleChart(): void {
    const m    = this.chartsData?.riskByModule;
    const hasD = (m?.labels?.length ?? 0) > 0;

    const labels = hasD ? m!.labels : ['Módulo I','Módulo II','Módulo III','Módulo IV','Módulo V'];
    const alto   = hasD ? m!.alto   : [14, 22, 31, 27, 18];
    const medio  = hasD ? m!.medio  : [18, 25, 20, 23, 16];
    const bajo   = hasD ? m!.bajo   : [30, 26, 24, 28, 32];

    this.makeChart('riskByModuleChart', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Riesgo alto',  data: alto,  backgroundColor: 'rgba(239,68,68,0.82)',  borderRadius: 0,                               stack: 'r' },
          { label: 'Riesgo medio', data: medio, backgroundColor: 'rgba(250,204,21,0.82)', borderRadius: 0,                               stack: 'r' },
          { label: 'Riesgo bajo',  data: bajo,  backgroundColor: 'rgba(34,197,94,0.82)',  borderRadius: { topLeft: 10, topRight: 10 },   stack: 'r' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        onClick: (_evt: any, elements: any[]) => {
          if (!elements.length) return;
          const label = labels[elements[0].index];
          this.setFilter('module', label, `Módulo: ${label}`);
        },
        plugins: {
          legend: { position: 'top', labels: { ...this.ll(), usePointStyle: true, pointStyleWidth: 12, padding: 20 } },
          tooltip: {
            ...this.tt(),
            callbacks: {
              title: (items: any[]) => {
                const i = items[0]?.dataIndex ?? 0;
                const t = (alto[i] ?? 0) + (medio[i] ?? 0) + (bajo[i] ?? 0);
                return `${items[0]?.label ?? ''} — Total: ${t} exámenes`;
              },
              label: (c: any) => {
                const v = c.parsed.y ?? 0;
                const i = c.dataIndex;
                const t = (alto[i] ?? 0) + (medio[i] ?? 0) + (bajo[i] ?? 0);
                const p = t > 0 ? Math.round((v / t) * 100) : 0;
                return ` ${c.dataset.label}: ${v} (${p}%) — click para filtrar`;
              },
            },
          },
        },
        scales: {
          x: { stacked: true, ticks: { color: '#bcd0ee' }, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { color: '#bcd0ee', stepSize: 5 }, grid: { color: 'rgba(255,255,255,0.08)' } },
        },
      },
    });
  }
}