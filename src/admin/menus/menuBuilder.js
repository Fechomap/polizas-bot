const { Markup } = require('telegraf');

class MenuBuilder {
  constructor() {
    this.buttons = [];
    this.currentRow = [];
    this.maxButtonsPerRow = 2;
  }

  /**
   * Añade un botón al menú
   */
  addButton(text, callbackData) {
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
  newRow() {
    if (this.currentRow.length > 0) {
      this.buttons.push([...this.currentRow]);
      this.currentRow = [];
    }
    return this;
  }

  /**
   * Añade un botón de navegación (volver, cancelar, etc)
   */
  addNavigationButton(text, callbackData) {
    this.newRow();
    this.buttons.push([Markup.button.callback(text, callbackData)]);
    return this;
  }

  /**
   * Añade botones de paginación
   */
  addPagination(currentPage, totalPages, baseCallback) {
    if (totalPages <= 1) return this;
    
    this.newRow();
    const paginationRow = [];
    
    if (currentPage > 1) {
      paginationRow.push(
        Markup.button.callback('⬅️ Anterior', `${baseCallback}_page_${currentPage - 1}`)
      );
    }
    
    paginationRow.push(
      Markup.button.callback(`📄 ${currentPage}/${totalPages}`, 'noop')
    );
    
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
  build() {
    // Añadir última fila si tiene botones
    if (this.currentRow.length > 0) {
      this.buttons.push(this.currentRow);
    }
    
    return Markup.inlineKeyboard(this.buttons);
  }

  /**
   * Método estático para crear un menú de confirmación
   */
  static confirmationMenu(confirmCallback, cancelCallback, confirmText = '✅ Confirmar', cancelText = '❌ Cancelar') {
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
  static categoryMenu(categories, baseCallback, backCallback) {
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
  static breadcrumbs(path) {
    const parts = path.map(p => p.name).join(' › ');
    return `📍 ${parts}`;
  }
}

module.exports = MenuBuilder;