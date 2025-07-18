"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class ChartGenerator {
    constructor() {
        this.defaultConfig = {
            width: 800,
            height: 400,
            backgroundColour: 'transparent',
            chartCallback: (ChartJS) => {
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
    async generateInsuranceDistributionChart(data) {
        return Buffer.from('Mock chart data for insurance distribution');
    }
    async generateDailyTrendChart(dailyData) {
        return Buffer.from('Mock chart data for daily trends');
    }
    async generateServiceAnalysisChart(serviciosStats) {
        return Buffer.from('Mock chart data for service analysis');
    }
    async generateComparativeChart(reports) {
        return Buffer.from('Mock chart data for comparative analysis');
    }
    async generateROIChart(aseguradoraAnalysis) {
        return Buffer.from('Mock chart data for ROI analysis');
    }
    createGradients(colors, count) {
        const result = [];
        for (let i = 0; i < count; i++) {
            result.push(colors[i % colors.length]);
        }
        return result;
    }
    static async generateChart(chartConfig, width = 800, height = 400) {
        try {
            return Buffer.from('Mock chart data - ChartJS implementation pending');
        }
        catch (error) {
            console.error('Error generando gráfica:', error);
            throw error;
        }
    }
}
exports.default = ChartGenerator;
