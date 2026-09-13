import React from 'react';

const GLYPHS = '0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ %[]:+-./';

/**
 * V08 comparison strip for HUD typography. The packaged asset closure contains no
 * Starsector font/bitmap-font file, so this deliberately samples the current HUD
 * monospace stack instead of pretending that an original glyph atlas was imported.
 */
export const HudGlyphSample: React.FC = () => (
  <div className="hud-glyph-sample" aria-label="HUD glyph comparison sample">
    {Array.from(GLYPHS).map((glyph, index) => (
      <span key={`${glyph}-${index}`} className="hud-glyph-cell">{glyph === ' ' ? '\u00a0' : glyph}</span>
    ))}
  </div>
);
