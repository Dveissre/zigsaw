export function crisIconMarkup(): string {
  return `
    <svg class="cris-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 22 12 12 22 2 12Z"></path>
      <path class="cris-icon-core" d="M15.65 9.68 17.97 12 15.65 14.32 13.33 12Z"></path>
    </svg>
  `;
}

export function crisBalanceMarkup(
  total: number,
  editable: boolean,
): string {
  return `
    <div class="corner-cris ${editable ? "is-debug" : ""}" role="status" aria-label="分光水晶 ${total}">
      ${crisIconMarkup()}
      ${
        editable
          ? `<input data-debug-cris type="number" min="0" step="1" value="${total}" aria-label="设置分光水晶数量">`
          : `<strong>${total}</strong>`
      }
    </div>
  `;
}
