"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseCommand_1 = __importDefault(require("./BaseCommand"));
class DeleteCommand extends BaseCommand_1.default {
    constructor(handler) {
        super(handler);
        this.ADMIN_ID = 7143094298;
    }
    getCommandName() {
        return 'delete';
    }
    getDescription() {
        return 'Marca una o más pólizas como eliminadas (solo admin).';
    }
    register() {
        this.logInfo(`Comando ${this.getCommandName()} cargado, pero no registra /comando aquí.`);
    }
}
exports.default = DeleteCommand;
