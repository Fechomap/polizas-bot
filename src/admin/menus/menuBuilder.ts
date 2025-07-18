import { Markup } from 'telegraf';
import { InlineKeyboardButton, InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram';

interface ICategory {
    id: string;
    name: string;
    emoji: string;
}

interface IBreadcrumb {
    name: string;
}

class MenuBuilder {
    private buttons: InlineKeyboardButton[][];
    private currentRow: InlineKeyboardButton[];
    private maxButtonsPerRow: number;

    constructor() {
        this.buttons = [];
        this.currentRow = [];
        this.maxButtonsPerRow = 2;
    }

    /**
     * Añade un botón al menú
     */
    addButton(text: string, callbackData: string): MenuBuilder {
        this.currentRow.push(Markup.button.callback(text, callbackData));

        if (this.currentRow.length >= this.maxButtonsPerRow) {
            this.buttons.push([...this.currentRow]);
            this.currentRow = [];
        }

        return this;
    }

    /**
     * Fuerza el inicio de una nueva fila
     */
    newRow(): MenuBuilder {
        if (this.currentRow.length > 0) {
            this.buttons.push([...this.currentRow]);
            this.currentRow = [];
        }
        return this;
    }

    /**
     * Añade un botón de navegación (volver, cancelar, etc)
     */
    addNavigationButton(text: string, callbackData: string): MenuBuilder {
        this.newRow();
        this.buttons.push([Markup.button.callback(text, callbackData)]);
        return this;
    }

    /**
     * Añade botones de paginación
     */
    addPagination(currentPage: number, totalPages: number, baseCallback: string): MenuBuilder {
        if (totalPages <= 1) return this;

        this.newRow();
        const paginationRow: InlineKeyboardButton[] = [];

        if (currentPage > 1) {
            paginationRow.push(
                Markup.button.callback('⬅️ Anterior', `${baseCallback}_page_${currentPage - 1}`)
            );
        }

        paginationRow.push(Markup.button.callback(`📄 ${currentPage}/${totalPages}`, 'noop'));

        if (currentPage < totalPages) {
            paginationRow.push(
                Markup.button.callback('Siguiente ➡️', `${baseCallback}_page_${currentPage + 1}`)
            );
        }

        this.buttons.push(paginationRow);
        return this;
    }

    /**
     * Construye el teclado inline final
     */
    build(): { reply_markup: InlineKeyboardMarkup } {
        // Añadir última fila si tiene botones
        if (this.currentRow.length > 0) {
            this.buttons.push(this.currentRow);
        }

        return Markup.inlineKeyboard(this.buttons);
    }

    /**
     * Método estático para crear un menú de confirmación
     */
    static confirmationMenu(
        confirmCallback: string,
        cancelCallback: string,
        confirmText = '✅ Confirmar',
        cancelText = '❌ Cancelar'
    ): { reply_markup: InlineKeyboardMarkup } {
        return Markup.inlineKeyboard([
            [
                Markup.button.callback(confirmText, confirmCallback),
                Markup.button.callback(cancelText, cancelCallback)
            ]
        ]);
    }

    /**
     * Método estático para crear un menú de categorías
     */
    static categoryMenu(
        categories: ICategory[],
        baseCallback: string,
        backCallback: string
    ): { reply_markup: InlineKeyboardMarkup } {
        const builder = new MenuBuilder();

        categories.forEach(category => {
            builder.addButton(
                `${category.emoji} ${category.name}`,
                `${baseCallback}_${category.id}`
            );
        });

        builder.addNavigationButton('⬅️ Volver', backCallback);

        return builder.build();
    }

    /**
     * Método estático para crear breadcrumbs
     */
    static breadcrumbs(path: IBreadcrumb[]): string {
        const parts = path.map(p => p.name).join(' › ');
        return `📍 ${parts}`;
    }
}

export default MenuBuilder;
