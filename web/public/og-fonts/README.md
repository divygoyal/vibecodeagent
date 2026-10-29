Geist Regular and Bold (Vercel, https://github.com/vercel/geist-font), licensed under the SIL Open Font License 1.1
(OFL.txt in this folder, https://openfontlicense.org). Used only to draw the Open Graph share images
(components/marketing/site/og.tsx); the site itself loads Geist through next/font.

Modified: the GPOS `kern` feature is emptied (scripts/dev/og-fonts-nokern.py), nothing else. next/og (Satori) measures
a word without kerning but draws it with kerning, which left a wider gap after every word that has kerned pairs
("Verified  traffic", "from", "confirmed"). Without kern lookups the two agree. Do not replace these files with the
stock release TTFs; run the script on them first. The Geist OFL has no Reserved Font Name.
