export function luhn(num) {
  const d = String(num).replace(/\D/g, '');
  if (d.length < 12) return false;
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = +d[i];
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}
export function innValid(num) {
  const d = String(num).replace(/\D/g, '');
  const ctrl = (digits, weights) => (weights.reduce((a, w, i) => a + w * digits[i], 0) % 11) % 10;
  if (d.length === 10) {
    const dd = [...d].map(Number);
    return ctrl(dd, [2, 4, 10, 3, 5, 9, 4, 6, 8]) === dd[9];
  }
  if (d.length === 12) {
    const dd = [...d].map(Number);
    const c1 = ctrl(dd, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]);
    const c2 = ctrl(dd, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]);
    return c1 === dd[10] && c2 === dd[11];
  }
  return false;
}
export function snilsValid(num) {
  const d = String(num).replace(/\D/g, '');
  if (d.length !== 11) return false;
  const body = d.slice(0, 9), check = +d.slice(9);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (+body[i]) * (9 - i);
  let c = sum % 101; if (c === 100) c = 0;
  return c === check;
}
