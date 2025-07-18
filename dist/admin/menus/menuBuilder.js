"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const telegraf_1 = require("telegraf");
class MenuBuilder {
    constructor() {
        this.buttons = [];
        this.currentRow = [];
        this.maxButtonsPerRow = 2;
    }
    addButton(text, callbackData) {
        this.currentRow.push(telegraf_1.Markup.button.callback(text, callbackData));
        if (this.currentRow.length >= this.maxButtonsPerRow) {
            this.buttons.push([...this.currentRow]);
            this.currentRow = [];
        }
        return this;
    }
    newRow() {
        if (this.currentRow.length > 0) {
            this.buttons.push([...this.currentRow]);
            this.currentRow = [];
        }
        return this;
    }
    addNavigationButton(text, callbackData) {
        this.newRow();
        this.buttons.push([telegraf_1.Markup.button.callback(text, callbackData)]);
        return this;
    }
    addPagination(currentPage, totalPages, baseCallback) {
        if (totalPages <= 1)
            return this;
        this.newRow();
        const paginationRow = [];
        if (currentPage > 1) {
            paginationRow.push(telegraf_1.Markup.button.callback('⬅️ Anterior', `${baseCallback}_page_${currentPage - 1}`));
        }
        paginationRow.push(telegraf_1.Markup.button.callback(`📄 ${currentPage}/${totalPages}`, 'noop'));
        if (currentPage < totalPages) {
            paginationRow.push(telegraf_1.Markup.button.callback('Siguiente ➡️', `${baseCallback}_page_${currentPage + 1}`));
        }
        this.buttons.push(paginationRow);
        return this;
    }
    build() {
        if (this.currentRow.length > 0) {
            this.buttons.push(this.currentRow);
        }
        return telegraf_1.Markup.inlineKeyboard(this.buttons);
    }
    static confirmationMenu(confirmCallback, cancelCallback, confirmText = '✅ Confirmar', cancelText = '❌ Cancelar') {
        return telegraf_1.Markup.inlineKeyboard([
            [
                telegraf_1.Markup.button.callback(confirmText, confirmCallback),
                telegraf_1.Markup.button.callback(cancelText, cancelCallback)
            ]
        ]);
    }
    static categoryMenu(categories, baseCallback, backCallback) {
        const builder = new MenuBuilder();
        categories.forEach(category => {
            builder.addButton(`${category.emoji} ${category.name}`, `${baseCallback}_${category.id}`);
        });
        builder.addNavigationButton('⬅️ Volver', backCallback);
        return builder.build();
    }
    static breadcrumbs(path) {
        const parts = path.map(p => p.name).join(' › ');
        return `📍 ${parts}`;
    }
}
exports.default = MenuBuilder;
