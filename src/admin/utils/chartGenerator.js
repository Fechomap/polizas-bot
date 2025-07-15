const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

/**
 * Generador de gráficas futuristas para empresa de IA
 * Paletas de colores avanzadas y diseños profesionales
 */
class ChartGenerator {
    constructor() {
        // Configuración base para gráficas
        this.defaultConfig = {
            width: 800,
            height: 400,
            backgroundColour: 'transparent',
            chartCallback: ChartJS => {
                // Registrar plugins personalizados
                ChartJS.defaults.font.family = 'Arial, sans-serif';
                ChartJS.defaults.font.size = 12;
            }
        };

        // PALETAS DE COLORES FUTURISTAS PARA IA
        this.colorPalettes = {
            // Paleta principal: Azules cibernéticos y neones
            cyber: {
                primary: ['#00D2FF', '#3A7BD5', '#00C9FF', '#92FE9D', '#FF006E'],
                gradient: ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe'],
                background: 'rgba(0, 210, 255, 0.1)',
                border: '#00D2FF',
                text: '#1a202c'
            },

            // Paleta secundaria: Violetas y magentas tech
            neural: {
                primary: ['#FF006E', '#8338EC', '#3A86FF', '#06FFA5', '#FFBE0B'],
                gradient: ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe'],
                background: 'rgba(255, 0, 110, 0.1)',
                border: '#8338EC',
                text: '#1a202c'
            },

            // Paleta de análisis: Verdes matrix y azules
            matrix: {
                primary: ['#39FF14', '#00FFFF', '#FF073A', '#FFD60A', '#BF40BF'],
                gradient: ['#11998e', '#38ef7d', '#0093E9', '#80D0C7', '#13547a'],
                background: 'rgba(57, 255, 20, 0.1)',
                border: '#00FFFF',
                text: '#1a202c'
            },

            // Paleta comparativa: Holográfica
            hologram: {
                primary: ['#FF0080', '#00FFFF', '#FF8000', '#8000FF', '#00FF80'],
                gradient: ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe'],
                background: 'rgba(255, 0, 128, 0.1)',
                border: '#00FFFF',
                text: '#1a202c'
            }
        };
    }

    /**
     * Genera gráfica de barras futurista para distribución por aseguradora
     */
    async generateInsuranceDistributionChart(data) {
        const chartJSNodeCanvas = new ChartJSNodeCanvas(this.defaultConfig);

        const aseguradoras = data.aseguradoraAnalysis.slice(0, 8); // Top 8
        const labels = aseguradoras.map(a => a._id || 'SIN ESPECIFICAR');
        const values = aseguradoras.map(a => a.totalPolicies);
        const palette = this.colorPalettes.cyber;

        const configuration = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Pólizas Contratadas',
                        data: values,
                        backgroundColor: this.createGradients(palette.primary, values.length),
                        borderColor: palette.primary,
                        borderWidth: 2,
                        borderRadius: 8,
                        borderSkipped: false
                    }
                ]
            },
            options: {
                responsive: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'DISTRIBUCIÓN INTELIGENTE POR ASEGURADORA',
                        font: {
                            size: 18,
                            weight: 'bold',
                            family: 'Arial'
                        },
                        color: '#1a365d',
                        padding: 20
                    },
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#00D2FF',
                        bodyColor: '#ffffff',
                        borderColor: '#00D2FF',
                        borderWidth: 1,
                        cornerRadius: 8,
                        callbacks: {
                            label: function (context) {
                                const percentage = (
                                    (context.parsed.y / data.totalPolicies) *
                                    100
                                ).toFixed(1);
                                return `${context.parsed.y} pólizas (${percentage}%)`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#4a5568',
                            font: {
                                size: 11,
                                weight: 'bold'
                            },
                            maxRotation: 45
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 210, 255, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#4a5568',
                            font: {
                                size: 11
                            }
                        }
                    }
                },
                layout: {
                    padding: {
                        top: 20,
                        bottom: 20,
                        left: 10,
                        right: 10
                    }
                }
            }
        };

        return await chartJSNodeCanvas.renderToBuffer(configuration);
    }

    /**
     * Genera gráfica de línea futurista para tendencias temporales
     */
    async generateDailyTrendChart(dailyData) {
        const chartJSNodeCanvas = new ChartJSNodeCanvas(this.defaultConfig);

        const labels = dailyData.map(d => `Día ${d._id.day}`);
        const policies = dailyData.map(d => d.policiesCount);
        const services = dailyData.map(d => d.servicesCount);
        const palette = this.colorPalettes.neural;

        const configuration = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Pólizas Contratadas',
                        data: policies,
                        borderColor: '#00D2FF',
                        backgroundColor: 'rgba(0, 210, 255, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#00D2FF',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 6,
                        pointHoverRadius: 8
                    },
                    {
                        label: 'Servicios Ejecutados',
                        data: services,
                        borderColor: '#FF006E',
                        backgroundColor: 'rgba(255, 0, 110, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#FF006E',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 6,
                        pointHoverRadius: 8
                    }
                ]
            },
            options: {
                responsive: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'ANÁLISIS TEMPORAL PREDICTIVO',
                        font: {
                            size: 18,
                            weight: 'bold',
                            family: 'Arial'
                        },
                        color: '#1a365d',
                        padding: 20
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#4a5568',
                            font: {
                                size: 12,
                                weight: 'bold'
                            },
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#00D2FF',
                        bodyColor: '#ffffff',
                        borderColor: '#00D2FF',
                        borderWidth: 1,
                        cornerRadius: 8
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(0, 210, 255, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#4a5568',
                            font: {
                                size: 10
                            },
                            maxRotation: 0
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 210, 255, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#4a5568',
                            font: {
                                size: 11
                            }
                        }
                    }
                },
                layout: {
                    padding: {
                        top: 20,
                        bottom: 20,
                        left: 10,
                        right: 10
                    }
                },
                elements: {
                    point: {
                        hoverBorderWidth: 3
                    }
                }
            }
        };

        return await chartJSNodeCanvas.renderToBuffer(configuration);
    }

    /**
     * Genera gráfica de dona futurista para análisis de servicios
     */
    async generateServiceAnalysisChart(serviciosStats) {
        const chartJSNodeCanvas = new ChartJSNodeCanvas({
            ...this.defaultConfig,
            width: 500,
            height: 500
        });

        const data = [
            serviciosStats.polizasSinServicios || 0,
            serviciosStats.polizasConUnServicio || 0,
            serviciosStats.polizasConDosServicios || 0
        ];

        const labels = ['Sin Servicios', 'Un Servicio', 'Dos+ Servicios'];
        const palette = this.colorPalettes.matrix;

        const configuration = {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [
                    {
                        data: data,
                        backgroundColor: [
                            'rgba(255, 7, 58, 0.8)', // Rojo matrix para sin servicios
                            'rgba(255, 214, 10, 0.8)', // Amarillo para un servicio
                            'rgba(57, 255, 20, 0.8)' // Verde matrix para completos
                        ],
                        borderColor: ['#FF073A', '#FFD60A', '#39FF14'],
                        borderWidth: 3,
                        hoverBorderWidth: 5
                    }
                ]
            },
            options: {
                responsive: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'ANÁLISIS PREDICTIVO DE SERVICIOS',
                        font: {
                            size: 16,
                            weight: 'bold',
                            family: 'Arial'
                        },
                        color: '#1a365d',
                        padding: 20
                    },
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            color: '#4a5568',
                            font: {
                                size: 12,
                                weight: 'bold'
                            },
                            padding: 20,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#39FF14',
                        bodyColor: '#ffffff',
                        borderColor: '#39FF14',
                        borderWidth: 1,
                        cornerRadius: 8,
                        callbacks: {
                            label: function (context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return `${context.label}: ${context.parsed} (${percentage}%)`;
                            }
                        }
                    }
                },
                cutout: '60%',
                layout: {
                    padding: 20
                }
            }
        };

        return await chartJSNodeCanvas.renderToBuffer(configuration);
    }

    /**
     * Genera gráfica comparativa de 6 meses con diseño holográfico
     */
    async generateComparativeChart(reports) {
        const chartJSNodeCanvas = new ChartJSNodeCanvas({
            ...this.defaultConfig,
            width: 900,
            height: 450
        });

        const labels = reports.map(r => r.month.substring(0, 3));
        const policies = reports.map(r => r.data.totalPolicies);
        const revenue = reports.map(r => r.data.financialSummary.totalRevenue / 1000); // En miles
        const palette = this.colorPalettes.hologram;

        const configuration = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Pólizas Contratadas',
                        data: policies,
                        borderColor: '#FF0080',
                        backgroundColor: 'rgba(255, 0, 128, 0.2)',
                        borderWidth: 4,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#FF0080',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 3,
                        pointRadius: 8,
                        pointHoverRadius: 10,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Ingresos (Miles $)',
                        data: revenue,
                        borderColor: '#00FFFF',
                        backgroundColor: 'rgba(0, 255, 255, 0.2)',
                        borderWidth: 4,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#00FFFF',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 3,
                        pointRadius: 8,
                        pointHoverRadius: 10,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'EVOLUCIÓN EMPRESARIAL - ANÁLISIS IA',
                        font: {
                            size: 20,
                            weight: 'bold',
                            family: 'Arial'
                        },
                        color: '#1a365d',
                        padding: 25
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#4a5568',
                            font: {
                                size: 14,
                                weight: 'bold'
                            },
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        titleColor: '#FF0080',
                        bodyColor: '#ffffff',
                        borderColor: '#00FFFF',
                        borderWidth: 2,
                        cornerRadius: 10,
                        titleFont: {
                            size: 14,
                            weight: 'bold'
                        },
                        bodyFont: {
                            size: 12
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 0, 128, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#4a5568',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 0, 128, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#FF0080',
                            font: {
                                size: 11,
                                weight: 'bold'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Pólizas',
                            color: '#FF0080',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        grid: {
                            drawOnChartArea: false
                        },
                        ticks: {
                            color: '#00FFFF',
                            font: {
                                size: 11,
                                weight: 'bold'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Ingresos (K$)',
                            color: '#00FFFF',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        }
                    }
                },
                layout: {
                    padding: {
                        top: 20,
                        bottom: 20,
                        left: 20,
                        right: 20
                    }
                }
            }
        };

        return await chartJSNodeCanvas.renderToBuffer(configuration);
    }

    /**
     * Crea gradientes para las gráficas
     */
    createGradients(colors, count) {
        const result = [];
        for (let i = 0; i < count; i++) {
            result.push(colors[i % colors.length]);
        }
        return result;
    }

    /**
     * Genera gráfica de barras apiladas para ROI por aseguradora
     */
    async generateROIChart(aseguradoraAnalysis) {
        const chartJSNodeCanvas = new ChartJSNodeCanvas(this.defaultConfig);

        const aseguradoras = aseguradoraAnalysis.slice(0, 6);
        const labels = aseguradoras.map(a => a._id || 'SIN ESPECIFICAR');
        const ingresos = aseguradoras.map(a => a.totalPaymentAmount / 1000);
        const costos = aseguradoras.map(a => a.totalServiceCost / 1000);

        const configuration = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Ingresos (K$)',
                        data: ingresos,
                        backgroundColor: 'rgba(0, 210, 255, 0.8)',
                        borderColor: '#00D2FF',
                        borderWidth: 2
                    },
                    {
                        label: 'Costos (K$)',
                        data: costos,
                        backgroundColor: 'rgba(255, 0, 110, 0.8)',
                        borderColor: '#FF006E',
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'ANÁLISIS FINANCIERO INTELIGENTE',
                        font: {
                            size: 18,
                            weight: 'bold'
                        },
                        color: '#1a365d',
                        padding: 20
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#4a5568',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#00D2FF',
                        bodyColor: '#ffffff',
                        borderColor: '#00D2FF',
                        borderWidth: 1,
                        cornerRadius: 8,
                        callbacks: {
                            afterBody: function (context) {
                                const aseg = aseguradoras[context[0].dataIndex];
                                return [
                                    `ROI: ${aseg.roi}%`,
                                    `Eficiencia: ${aseg.serviceUsageRate}%`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#4a5568',
                            font: {
                                size: 11,
                                weight: 'bold'
                            },
                            maxRotation: 45
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 210, 255, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#4a5568',
                            font: {
                                size: 11
                            }
                        },
                        title: {
                            display: true,
                            text: 'Miles de Pesos (K$)',
                            color: '#4a5568',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        }
                    }
                }
            }
        };

        return await chartJSNodeCanvas.renderToBuffer(configuration);
    }

    /**
     * Método general para generar cualquier tipo de gráfica con configuración personalizada
     * @param {Object} chartConfig - Configuración completa de Chart.js
     * @param {number} width - Ancho de la gráfica
     * @param {number} height - Alto de la gráfica
     * @returns {Promise<Buffer>} Buffer de la imagen de la gráfica
     */
    static async generateChart(chartConfig, width = 800, height = 400) {
        try {
            const chartJSNodeCanvas = new ChartJSNodeCanvas({
                width,
                height,
                backgroundColour: 'white',
                chartCallback: ChartJS => {
                    ChartJS.defaults.font.family = 'Arial, sans-serif';
                    ChartJS.defaults.font.size = 12;
                    ChartJS.defaults.color = '#333333';
                }
            });

            return await chartJSNodeCanvas.renderToBuffer(chartConfig);
        } catch (error) {
            console.error('Error generando gráfica:', error);
            throw error;
        }
    }
}

module.exports = ChartGenerator;
