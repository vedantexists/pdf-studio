/**
 * Shared true Latin-1 (ISO-8859-1) decoder/encoder for test suites.
 * Unlike new TextDecoder('latin1') which aliases windows-1252 (remapping 0x80-0x9F),
 * Buffer.from(..., 'latin1') performs true 1:1 byte-to-char code mapping.
 */

function decode(u8) {
  if (!u8) return '';
  return Buffer.from(u8).toString('latin1');
}

function encode(str) {
  if (typeof str !== 'string') return Buffer.alloc(0);
  return Buffer.from(str, 'latin1');
}

module.exports = {
  decode,
  encode,
};
