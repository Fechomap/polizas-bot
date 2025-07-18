// types/index.d.ts - Barrel file para todos los tipos

export * from './global';
export * from './database';
export * from './bot';

// Re-exportar tipos de librerías externas con alias
export type { Context as TelegrafContext } from 'telegraf';
export type { Document as MongooseDocument, ObjectId } from 'mongoose';
export type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
