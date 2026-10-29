#!/usr/bin/env python3
"""Drops the GPOS 'kern' feature from a Geist TTF so Open Graph cards (next/og, Satori) space words evenly.

Why: Satori lays a word out as the sum of single-character advances (no kerning, no ligatures) but draws the word with
the font's GPOS kerning applied. Each kerned pair makes the drawn word narrower than its box, and the next word is
placed at the box edge, so every word with kerned pairs (V-e, f-i, f-f, f-r ...) is followed by a visibly wider gap.
With no kern lookups the drawn width equals the measured width.

Usage: python3 scripts/dev/og-fonts-nokern.py <in.ttf> <out.ttf>   (needs fontTools: pip install fonttools)
"""
import sys
from fontTools.ttLib import TTFont

font = TTFont(sys.argv[1])
for rec in font['GPOS'].table.FeatureList.FeatureRecord:
    if rec.FeatureTag == 'kern':
        rec.Feature.LookupListIndex = []
font.save(sys.argv[2])
