"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseCommand_1 = __importDefault(require("./BaseCommand"));
class AddPaymentCommand extends BaseCommand_1.default {
    constructor(handler) {
        super(handler);
    }
    getCommandName() {
        return 'addpayment';
    }
    getDescription() {
        return 'Registra un pago para una póliza existente.';
    }
    register() {
        this.logInfo(`Comando ${this.getCommandName()} cargado, pero no registra /comando aquí.`);
    }
}
exports.default = AddPaymentCommand;
