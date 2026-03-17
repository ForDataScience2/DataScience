import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartOptions, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-dash-board-general',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dash-board-general.html',
  styleUrl: './dash-board-general.css',
})
export class DashBoardGeneral implements AfterViewInit, OnDestroy {
  private charts: Chart<any, any, any>[] = [];

  kpis = [
    {
      title: 'Estudiantes analizados',
      value: '1,284',
      change: '+12.4%',
      positive: true,
      icon: '👨‍🎓',
    },
    {
      title: 'Estudiantes en riesgo',
      value: '186',
      change: '+4.2%',
      positive: false,
      icon: '⚠️',
    },
    {
      title: 'Materias activas',
      value: '42',
      change: '+8.1%',
      positive: true,
      icon: '📚',
    },
    {
      title: 'Promedio de actividad',
      value: '74%',
      change: '+6.7%',
      positive: true,
      icon: '📈',
    },
  ];

  alerts = [
    {
      student: 'María López',
      career: 'Ingeniería Informática',
      subject: 'Base de Datos',
      risk: 'Alto',
      score: '91%',
    },
    {
      student: 'Carlos Mejía',
      career: 'Administración',
      subject: 'Estadística',
      risk: 'Medio',
      score: '76%',
    },
    {
      student: 'Andrea Pineda',
      career: 'Psicología',
      subject: 'Metodología',
      risk: 'Alto',
      score: '88%',
    },
    {
      student: 'José Valladares',
      career: 'Derecho',
      subject: 'Historia',
      risk: 'Medio',
      score: '71%',
    },
    {
      student: 'Fernanda Cruz',
      career: 'Mercadotecnia',
      subject: 'Finanzas',
      risk: 'Bajo',
      score: '39%',
    },
  ];

  recommendations = [
    'Los estudiantes con baja actividad en guías y exámenes muestran mayor probabilidad de riesgo.',
    'La carrera de Ingeniería Informática concentra el mayor número de alertas activas.',
    'Las materias con dificultad alta están asociadas con mayor inactividad reciente.',
    'El sentimiento negativo en textos académicos coincide con mayor probabilidad de riesgo.',
    'Se recomienda seguimiento inmediato a estudiantes con score superior al 85%.',
  ];

  ngAfterViewInit(): void {
    this.createRiskByCareerChart();
    this.createDifficultyChart();
    this.createWeeklyActivityChart();
    this.createPerformanceRadarChart();
    this.createActivityVsRiskChart();
    this.createRiskByModuleChart();
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  private destroyCharts(): void {
    this.charts.forEach((chart) => chart.destroy());
    this.charts = [];
  }

  private createRiskByCareerChart(): void {
    const chart = new Chart('riskByCareerChart', {
      type: 'bar',
      data: {
        labels: [
          'Informática',
          'Administración',
          'Psicología',
          'Derecho',
          'Mercadotecnia',
        ],
        datasets: [
          {
            label: 'Estudiantes en riesgo',
            data: [52, 37, 28, 21, 48],
            backgroundColor: [
              'rgba(99, 102, 241, 0.75)',
              'rgba(236, 72, 153, 0.75)',
              'rgba(34, 197, 94, 0.75)',
              'rgba(249, 115, 22, 0.75)',
              'rgba(14, 165, 233, 0.75)',
            ],
            borderRadius: 12,
            borderSkipped: false,
          },
        ],
      },
      options: this.getBarOptions('Cantidad'),
    });

    this.charts.push(chart);
  }

  private createDifficultyChart(): void {
    const chart = new Chart('difficultyChart', {
      type: 'doughnut',
      data: {
        labels: ['Fácil', 'Intermedio', 'Difícil'],
        datasets: [
          {
            data: [24, 46, 30],
            backgroundColor: [
              'rgba(34, 197, 94, 0.85)',
              'rgba(250, 204, 21, 0.85)',
              'rgba(239, 68, 68, 0.85)',
            ],
            borderColor: 'rgba(255,255,255,0.08)',
            borderWidth: 2,
            hoverOffset: 12,
          },
        ],
      },
      options: this.getDoughnutOptions(),
    });

    this.charts.push(chart);
  }

  private createWeeklyActivityChart(): void {
    const chart = new Chart('weeklyActivityChart', {
      type: 'line',
      data: {
        labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5', 'Sem 6'],
        datasets: [
          {
            label: 'Guías creadas',
            data: [35, 52, 48, 61, 58, 72],
            borderColor: 'rgba(99, 102, 241, 1)',
            backgroundColor: 'rgba(99, 102, 241, 0.15)',
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: 'Exámenes creados',
            data: [18, 24, 20, 29, 31, 40],
            borderColor: 'rgba(236, 72, 153, 1)',
            backgroundColor: 'rgba(236, 72, 153, 0.08)',
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
        ],
      },
      options: this.getLineOptions(),
    });

    this.charts.push(chart);
  }

  private createPerformanceRadarChart(): void {
    const chart = new Chart('performanceRadarChart', {
      type: 'radar',
      data: {
        labels: [
          'Asistencia',
          'Exámenes',
          'Guías',
          'Participación',
          'Tareas',
          'Tiempo de estudio',
        ],
        datasets: [
          {
            label: 'Promedio general',
            data: [82, 69, 74, 78, 85, 64],
            backgroundColor: 'rgba(14, 165, 233, 0.20)',
            borderColor: 'rgba(14, 165, 233, 1)',
            pointBackgroundColor: 'rgba(14, 165, 233, 1)',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: 'rgba(14, 165, 233, 1)',
          },
        ],
      },
      options: this.getRadarOptions(),
    });

    this.charts.push(chart);
  }

  private createActivityVsRiskChart(): void {
    const chart = new Chart('activityVsRiskChart', {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Actividad vs Riesgo',
            data: [
              { x: 18, y: 88 },
              { x: 22, y: 82 },
              { x: 31, y: 73 },
              { x: 40, y: 61 },
              { x: 48, y: 52 },
              { x: 56, y: 43 },
              { x: 63, y: 34 },
              { x: 74, y: 22 },
              { x: 82, y: 16 },
              { x: 91, y: 10 },
            ],
            backgroundColor: 'rgba(168, 85, 247, 0.85)',
            pointRadius: 6,
            pointHoverRadius: 8,
          },
        ],
      },
      options: this.getScatterOptions(),
    });

    this.charts.push(chart);
  }

  private createRiskByModuleChart(): void {
    const chart = new Chart('riskByModuleChart', {
      type: 'bar',
      data: {
        labels: ['Módulo I', 'Módulo II', 'Módulo III', 'Módulo IV', 'Módulo V'],
        datasets: [
          {
            label: 'Riesgo alto',
            data: [14, 22, 31, 27, 18],
            backgroundColor: 'rgba(239, 68, 68, 0.78)',
            borderRadius: 10,
          },
          {
            label: 'Riesgo medio',
            data: [18, 25, 20, 23, 16],
            backgroundColor: 'rgba(250, 204, 21, 0.78)',
            borderRadius: 10,
          },
          {
            label: 'Riesgo bajo',
            data: [30, 26, 24, 28, 32],
            backgroundColor: 'rgba(34, 197, 94, 0.78)',
            borderRadius: 10,
          },
        ],
      },
      options: this.getStackedBarOptions(),
    });

    this.charts.push(chart);
  }

  private getBarOptions(yTitle: string): ChartOptions<'bar'> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#dbe4ff',
            font: {
              size: 12,
              weight: 'bold',
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#cbd5e1',
          },
          grid: {
            color: 'rgba(255,255,255,0.06)',
          },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: yTitle,
            color: '#dbe4ff',
          },
          ticks: {
            color: '#cbd5e1',
          },
          grid: {
            color: 'rgba(255,255,255,0.08)',
          },
        },
      },
    };
  }

  private getDoughnutOptions(): ChartOptions<'doughnut'> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#dbe4ff',
            font: {
              size: 13,
              weight: 'bold',
            },
          },
        },
      },
    };
  }

  private getLineOptions(): ChartOptions<'line'> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#dbe4ff',
            font: {
              size: 12,
              weight: 'bold',
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#cbd5e1',
          },
          grid: {
            color: 'rgba(255,255,255,0.06)',
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: '#cbd5e1',
          },
          grid: {
            color: 'rgba(255,255,255,0.08)',
          },
        },
      },
    };
  }

  private getRadarOptions(): ChartOptions<'radar'> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#dbe4ff',
            font: {
              size: 12,
              weight: 'bold',
            },
          },
        },
      },
      scales: {
        r: {
          angleLines: {
            color: 'rgba(255,255,255,0.12)',
          },
          grid: {
            color: 'rgba(255,255,255,0.12)',
          },
          pointLabels: {
            color: '#dbe4ff',
            font: {
              size: 12,
            },
          },
          ticks: {
            color: '#cbd5e1',
            backdropColor: 'transparent',
          },
        },
      },
    };
  }

  private getScatterOptions(): ChartOptions<'scatter'> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#dbe4ff',
            font: {
              size: 12,
              weight: 'bold',
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Nivel de actividad',
            color: '#dbe4ff',
          },
          ticks: {
            color: '#cbd5e1',
          },
          grid: {
            color: 'rgba(255,255,255,0.08)',
          },
        },
        y: {
          title: {
            display: true,
            text: 'Probabilidad de riesgo (%)',
            color: '#dbe4ff',
          },
          ticks: {
            color: '#cbd5e1',
          },
          grid: {
            color: 'rgba(255,255,255,0.08)',
          },
        },
      },
    };
  }

  private getStackedBarOptions(): ChartOptions<'bar'> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#dbe4ff',
            font: {
              size: 12,
              weight: 'bold',
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: {
            color: '#cbd5e1',
          },
          grid: {
            color: 'rgba(255,255,255,0.06)',
          },
        },
        y: {
          stacked: true,
          ticks: {
            color: '#cbd5e1',
          },
          grid: {
            color: 'rgba(255,255,255,0.08)',
          },
        },
      },
    };
  }

  getRiskClass(risk: string): string {
    switch (risk.toLowerCase()) {
      case 'alto':
        return 'risk-high';
      case 'medio':
        return 'risk-medium';
      default:
        return 'risk-low';
    }
  }
}