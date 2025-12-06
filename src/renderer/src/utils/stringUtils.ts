/**
 * String utility functions
 */

/**
 * Converts camelCase or snake_case to Title Case
 * Examples:
 * - "firstName" -> "First Name"
 * - "first_name" -> "First Name"
 * - "isActive" -> "Is Active"
 * - "createdAt" -> "Created At"
 */
export function formatLabel(name: string): string {
  // Handle camelCase: insert space before uppercase letters
  let formatted = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  
  // Handle snake_case: replace underscores with spaces
  formatted = formatted.replace(/_/g, ' ');
  
  // Handle kebab-case: replace hyphens with spaces
  formatted = formatted.replace(/-/g, ' ');
  
  // Capitalize first letter of each word
  formatted = formatted
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  return formatted;
}

