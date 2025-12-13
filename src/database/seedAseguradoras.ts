// src/database/seedAseguradoras.ts
/**
 * Seed de aseguradoras para Prisma/PostgreSQL
 */

import { prisma } from './prisma';
import logger from '../utils/logger';

/**
 * Datos iniciales de aseguradoras mexicanas
 */
const ASEGURADORAS_SEED = [
    {
        nombre: 'GRUPO NACIONAL PROVINCIAL',
        nombreCorto: 'GNP',
        aliases: ['GNP SEGUROS', 'GRUPO NACIONAL PROVINCIAL S.A.B.'],
        activa: true,
        contactoWeb: 'https://www.gnp.com.mx'
    },
    {
        nombre: 'AXA SEGUROS S.A. DE C.V.',
        nombreCorto: 'AXA',
        aliases: ['AXA SEGUROS', 'AXA MEXICO'],
        activa: true,
        contactoWeb: 'https://www.axa.mx'
    },
    {
        nombre: 'QUALITAS COMPAÑIA DE SEGUROS',
        nombreCorto: 'QUALITAS',
        aliases: ['QUÁLITAS', 'QUALITAS SEGUROS'],
        activa: true,
        contactoWeb: 'https://www.qualitas.com.mx'
    },
    {
        nombre: 'HDI SEGUROS S.A. DE C.V.',
        nombreCorto: 'HDI',
        aliases: ['HDI SEGUROS', 'HDI MEXICO'],
        activa: true,
        contactoWeb: 'https://www.hdi.com.mx'
    },
    {
        nombre: 'SEGUROS MONTERREY NEW YORK LIFE',
        nombreCorto: 'MONTERREY',
        aliases: ['MONTERREY NEW YORK LIFE', 'SMNYL', 'SEGUROS MONTERREY'],
        activa: true,
        contactoWeb: 'https://www.segurosmonterrey.com.mx'
    },
    {
        nombre: 'MAPFRE MEXICO S.A.',
        nombreCorto: 'MAPFRE',
        aliases: ['MAPFRE SEGUROS', 'MAPFRE TEPEYAC'],
        activa: true,
        contactoWeb: 'https://www.mapfre.com.mx'
    },
    {
        nombre: 'ZURICH SANTANDER SEGUROS MEXICO',
        nombreCorto: 'ZURICH',
        aliases: ['ZURICH SEGUROS', 'ZURICH SANTANDER'],
        activa: true,
        contactoWeb: 'https://www.zurich.com.mx'
    },
    {
        nombre: 'CHUBB SEGUROS MEXICO S.A.',
        nombreCorto: 'CHUBB',
        aliases: ['CHUBB SEGUROS', 'ACE SEGUROS'],
        activa: true,
        contactoWeb: 'https://www.chubb.com/mx-es'
    },
    {
        nombre: 'SEGUROS INBURSA S.A.',
        nombreCorto: 'INBURSA',
        aliases: ['INBURSA SEGUROS', 'GRUPO FINANCIERO INBURSA'],
        activa: true,
        contactoWeb: 'https://www.inbursa.com'
    },
    {
        nombre: 'SEGUROS ATLAS S.A.',
        nombreCorto: 'ATLAS',
        aliases: ['ATLAS SEGUROS'],
        activa: true,
        contactoWeb: 'https://www.segurosatlas.com.mx'
    },
    {
        nombre: 'ANA COMPAÑIA DE SEGUROS S.A. DE C.V.',
        nombreCorto: 'ANA',
        aliases: ['ANA SEGUROS'],
        activa: true,
        contactoWeb: 'https://www.anaseguros.com.mx'
    },
    {
        nombre: 'ALLIANZ MEXICO S.A.',
        nombreCorto: 'ALLIANZ',
        aliases: ['ALLIANZ SEGUROS'],
        activa: true,
        contactoWeb: 'https://www.allianz.com.mx'
    },
    {
        nombre: 'AFIRME SEGUROS',
        nombreCorto: 'AFIRME',
        aliases: ['SEGUROS AFIRME'],
        activa: true,
        contactoWeb: 'https://www.afirme.com'
    },
    {
        nombre: 'SEGUROS BANORTE S.A.',
        nombreCorto: 'BANORTE',
        aliases: ['BANORTE SEGUROS', 'GENERALI BANORTE'],
        activa: true,
        contactoWeb: 'https://www.banorte.com'
    },
    {
        nombre: 'PRIMERO SEGUROS S.A. DE C.V.',
        nombreCorto: 'PRIMERO',
        aliases: ['PRIMERO SEGUROS'],
        activa: true,
        contactoWeb: 'https://www.primeroseguros.com.mx'
    },
    {
        nombre: 'GENERAL DE SEGUROS S.A.B.',
        nombreCorto: 'GENERAL',
        aliases: ['GENERAL DE SEGUROS'],
        activa: true,
        contactoWeb: 'https://www.generaldeseguros.mx'
    },
    {
        nombre: 'LA LATINO SEGUROS S.A.',
        nombreCorto: 'LA LATINO',
        aliases: ['LATINO SEGUROS', 'LA LATINOAMERICANA'],
        activa: true,
        contactoWeb: 'https://www.lalatino.com'
    },
    {
        nombre: 'TOKIO MARINE COMPAÑIA DE SEGUROS',
        nombreCorto: 'TOKIO MARINE',
        aliases: ['TOKIO MARINE SEGUROS'],
        activa: true,
        contactoWeb: 'https://www.tokiomarine.mx'
    },
    {
        nombre: 'SURA MEXICO SEGUROS',
        nombreCorto: 'SURA',
        aliases: ['SEGUROS SURA', 'RSA SEGUROS'],
        activa: true,
        contactoWeb: 'https://www.segurossura.com.mx'
    },
    {
        nombre: 'SEGUROS EL POTOSI S.A.',
        nombreCorto: 'EL POTOSI',
        aliases: ['POTOSI SEGUROS', 'POTOSI'],
        activa: true,
        contactoWeb: 'https://www.elpotosi.com.mx'
    },
    {
        nombre: 'SEGUROS ARGOS S.A. DE C.V.',
        nombreCorto: 'ARGOS',
        aliases: ['ARGOS SEGUROS'],
        activa: true,
        contactoWeb: 'https://www.segurosargos.com'
    },
    {
        nombre: 'BX+ SEGUROS',
        nombreCorto: 'BX+',
        aliases: ['BANCO VE POR MAS', 'VE POR MAS SEGUROS'],
        activa: true,
        contactoWeb: 'https://www.vepormas.com'
    },
    {
        nombre: 'AUTOFIN SEGUROS',
        nombreCorto: 'AUTOFIN',
        aliases: ['AUTOFIN'],
        activa: true,
        contactoWeb: 'https://www.autofin.com.mx'
    },
    {
        nombre: 'SEGUROS AZTECA S.A. DE C.V.',
        nombreCorto: 'AZTECA',
        aliases: ['AZTECA SEGUROS', 'GRUPO ELEKTRA'],
        activa: true,
        contactoWeb: 'https://www.seguros-azteca.com.mx'
    },
    {
        nombre: 'METLIFE MEXICO S.A.',
        nombreCorto: 'METLIFE',
        aliases: ['METLIFE SEGUROS'],
        activa: true,
        contactoWeb: 'https://www.metlife.com.mx'
    },
    {
        nombre: 'ABA SEGUROS S.A. DE C.V.',
        nombreCorto: 'ABA',
        aliases: ['ABA SEGUROS'],
        activa: true,
        contactoWeb: 'https://www.abaseguros.com'
    }
];

/**
 * Función para inicializar las aseguradoras en la base de datos (Prisma)
 */
export async function seedAseguradoras(): Promise<void> {
    try {
        const count = await prisma.aseguradora.count();

        if (count === 0) {
            logger.info('[Aseguradoras] Inicializando catálogo de aseguradoras...');

            for (const asegData of ASEGURADORAS_SEED) {
                await prisma.aseguradora.upsert({
                    where: { nombre: asegData.nombre },
                    update: {},
                    create: asegData
                });
            }

            logger.info(`[Aseguradoras] ${ASEGURADORAS_SEED.length} aseguradoras inicializadas`);
        } else {
            logger.debug(`[Aseguradoras] Catálogo ya existe con ${count} registros`);
        }
    } catch (error) {
        logger.error('[Aseguradoras] Error inicializando catálogo:', error);
    }
}
