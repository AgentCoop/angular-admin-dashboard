

/**
 * Helper function to get mouse coordinates in document coordinate system
 * This accounts for page scrolling
 */
export function getDocumentCoordinates(event: PointerEvent | MouseEvent): { x: number; y: number } {
  // Use pageX/pageY for document coordinates (includes scroll offset)
  // Fallback to clientX/clientY + scroll offset for compatibility
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

  return {
    x: event.pageX !== undefined ? event.pageX : event.clientX + scrollX,
    y: event.pageY !== undefined ? event.pageY : event.clientY + scrollY
  };
}

/**
 * Helper function to get element position in document coordinate system
 */
export function getElementDocumentPosition(element: HTMLElement): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

  return {
    x: rect.left + scrollX,
    y: rect.top + scrollY
  };
}
