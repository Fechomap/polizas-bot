// src/comandos/comandos/index.js
const BaseCommand = require('./BaseCommand');
const CommandRegistry = require('./CommandRegistry');
const StartCommand = require('./StartCommand');
const GetCommand = require('./GetCommand');
const ViewFilesCallbacks = require('./ViewFilesCallbacks');
const TextMessageHandler = require('./TextMessageHandler');
const MediaUploadHandler = require('./MediaUploadHandler');
const HelpCommand = require('./HelpCommand');
const OcuparPolizaCallback = require('./OcuparPolizaCallback');
const TestCommand = require('./TestCommand');
const AddPaymentCommand = require('./AddPaymentCommand');
const AddServiceCommand = require('./AddServiceCommand');
const SaveCommand = require('./SaveCommand');
const DeleteCommand = require('./DeleteCommand');
const ReportPaymentCommand = require('./ReportPaymentCommand');
const ReportUsedCommand = require('./ReportUsedCommand');

module.exports = {
    BaseCommand,
    CommandRegistry,
    StartCommand,
    GetCommand,
    ViewFilesCallbacks,
    TextMessageHandler,
    MediaUploadHandler,
    HelpCommand,
    OcuparPolizaCallback,
    TestCommand,
    AddPaymentCommand,
    AddServiceCommand,
    SaveCommand,
    DeleteCommand,
    ReportPaymentCommand,
    ReportUsedCommand
};
