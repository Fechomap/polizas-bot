// Note: chartjs-node-canvas types may not be available, using 'any' where needed

interface IChartConfig {
    width: number;
    height: number;
    backgroundColour: string;
    chartCallback?: (ChartJS: any) => void;
}

interface IColorPalette {
    primary: string[];
    gradient: string[];
    background: string;
    border: string;
    text: string;
}

interface IAseguradoraAnalysis {
    _id: string;
    totalPolicies: number;
    totalPaymentAmount: number;
    totalServiceCost: number;
    roi: number;
    serviceUsageRate: number;
}

interface IDailyData {
    _id: {
        day: number;
    };
    policiesCount: number;
    servicesCount: number;
}

interface IServiciosStats {
    polizasSinServicios: number;
    polizasConUnServicio: number;
    polizasConDosServicios: number;
}

interface IReport {
    month: string;
    data: {
        totalPolicies: number;
        financialSummary: {
            totalRevenue: number;
        };
    };
}

interface IChartData {
    totalPolicies: number;
    aseguradoraAnalysis: IAseguradoraAnalysis[];
}

class ChartGenerator {
    private defaultConfig: IChartConfig;
    private colorPalettes: {
        cyber: IColorPalette;
        neural: IColorPalette;
        matrix: IColorPalette;
        hologram: IColorPalette;
    };

    constructor() {
        this.defaultConfig = {
            width: 800,
            height: 400,
            backgroundColour: 'transparent',
            chartCallback: (ChartJS: any) => {
                ChartJS.defaults.font.family = 'Arial, sans-serif';
                ChartJS.defaults.font.size = 12;
            }
        };

        this.colorPalettes = {
            cyber: {
                primary: ['#00D2FF', '#3A7BD5', '#00C9FF', '#92FE9D', '#FF006E'],
                gradient: ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe'],
                background: 'rgba(0, 210, 255, 0.1)',
                border: '#00D2FF',
                text: '#1a202c'
            },
            neural: {
                primary: ['#FF006E', '#8338EC', '#3A86FF', '#06FFA5', '#FFBE0B'],
                gradient: ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe'],
                background: 'rgba(255, 0, 110, 0.1)',
                border: '#8338EC',
                text: '#1a202c'
            },
            matrix: {
                primary: ['#39FF14', '#00FFFF', '#FF073A', '#FFD60A', '#BF40BF'],
                gradient: ['#11998e', '#38ef7d', '#0093E9', '#80D0C7', '#13547a'],
                background: 'rgba(57, 255, 20, 0.1)',
                border: '#00FFFF',
                text: '#1a202c'
            },
            hologram: {
                primary: ['#FF0080', '#00FFFF', '#FF8000', '#8000FF', '#00FF80'],
                gradient: ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe'],
                background: 'rgba(255, 0, 128, 0.1)',
                border: '#00FFFF',
                text: '#1a202c'
            }
        };
    }

    async generateInsuranceDistributionChart(data: IChartData): Promise<Buffer> {
        // TODO: Implement when chartjs-node-canvas types are available
        // For now, return a mock buffer
        return Buffer.from('Mock chart data for insurance distribution');
    }

    async generateDailyTrendChart(dailyData: IDailyData[]): Promise<Buffer> {
        // TODO: Implement when chartjs-node-canvas types are available
        return Buffer.from('Mock chart data for daily trends');
    }

    async generateServiceAnalysisChart(serviciosStats: IServiciosStats): Promise<Buffer> {
        // TODO: Implement when chartjs-node-canvas types are available
        return Buffer.from('Mock chart data for service analysis');
    }

    async generateComparativeChart(reports: IReport[]): Promise<Buffer> {
        // TODO: Implement when chartjs-node-canvas types are available
        return Buffer.from('Mock chart data for comparative analysis');
    }

    async generateROIChart(aseguradoraAnalysis: IAseguradoraAnalysis[]): Promise<Buffer> {
        // TODO: Implement when chartjs-node-canvas types are available
        return Buffer.from('Mock chart data for ROI analysis');
    }

    createGradients(colors: string[], count: number): string[] {
        const result: string[] = [];
        for (let i = 0; i < count; i++) {
            result.push(colors[i % colors.length]);
        }
        return result;
    }

    static async generateChart(chartConfig: any, width = 800, height = 400): Promise<Buffer> {
        try {
            // TODO: Implement when chartjs-node-canvas types are available
            // const chartJSNodeCanvas = new ChartJSNodeCanvas({
            //     width,
            //     height,
            //     backgroundColour: 'white',
            //     chartCallback: (ChartJS: any) => {
            //         ChartJS.defaults.font.family = 'Arial, sans-serif';
            //         ChartJS.defaults.font.size = 12;
            //         ChartJS.defaults.color = '#333333';
            //     }
            // });
            // return await chartJSNodeCanvas.renderToBuffer(chartConfig);

            return Buffer.from('Mock chart data - ChartJS implementation pending');
        } catch (error) {
            console.error('Error generando gráfica:', error);
            throw error;
        }
    }
}

export default ChartGenerator;
