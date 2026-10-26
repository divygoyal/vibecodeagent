/**
 * Country names and flags. GA4 reports country names ('United States'),
 * Search Console reports ISO 3166-1 alpha-3 codes ('usa').
 */
const COUNTRIES: [iso2: string, iso3: string, name: string][] = [
    ['US', 'usa', 'United States'], ['GB', 'gbr', 'United Kingdom'], ['IN', 'ind', 'India'], ['CA', 'can', 'Canada'],
    ['DE', 'deu', 'Germany'], ['AU', 'aus', 'Australia'], ['FR', 'fra', 'France'], ['NL', 'nld', 'Netherlands'],
    ['BR', 'bra', 'Brazil'], ['ES', 'esp', 'Spain'], ['JP', 'jpn', 'Japan'], ['SG', 'sgp', 'Singapore'],
    ['SE', 'swe', 'Sweden'], ['IE', 'irl', 'Ireland'], ['PL', 'pol', 'Poland'], ['MX', 'mex', 'Mexico'],
    ['PH', 'phl', 'Philippines'], ['NG', 'nga', 'Nigeria'], ['ZA', 'zaf', 'South Africa'], ['IT', 'ita', 'Italy'],
    ['CH', 'che', 'Switzerland'], ['AE', 'are', 'United Arab Emirates'], ['KR', 'kor', 'South Korea'], ['ID', 'idn', 'Indonesia'],
    ['PK', 'pak', 'Pakistan'], ['BD', 'bgd', 'Bangladesh'], ['VN', 'vnm', 'Vietnam'], ['TR', 'tur', 'Türkiye'],
    ['RU', 'rus', 'Russia'], ['UA', 'ukr', 'Ukraine'], ['AR', 'arg', 'Argentina'], ['CO', 'col', 'Colombia'],
    ['CL', 'chl', 'Chile'], ['PE', 'per', 'Peru'], ['EG', 'egy', 'Egypt'], ['KE', 'ken', 'Kenya'],
    ['MA', 'mar', 'Morocco'], ['SA', 'sau', 'Saudi Arabia'], ['IL', 'isr', 'Israel'], ['NZ', 'nzl', 'New Zealand'],
    ['NO', 'nor', 'Norway'], ['DK', 'dnk', 'Denmark'], ['FI', 'fin', 'Finland'], ['BE', 'bel', 'Belgium'],
    ['AT', 'aut', 'Austria'], ['PT', 'prt', 'Portugal'], ['GR', 'grc', 'Greece'], ['CZ', 'cze', 'Czechia'],
    ['RO', 'rou', 'Romania'], ['HU', 'hun', 'Hungary'], ['MY', 'mys', 'Malaysia'], ['TH', 'tha', 'Thailand'],
    ['HK', 'hkg', 'Hong Kong'], ['TW', 'twn', 'Taiwan'], ['CN', 'chn', 'China'], ['LK', 'lka', 'Sri Lanka'],
    ['NP', 'npl', 'Nepal'], ['GH', 'gha', 'Ghana'], ['ET', 'eth', 'Ethiopia'], ['TZ', 'tza', 'Tanzania'],
    ['UG', 'uga', 'Uganda'], ['DZ', 'dza', 'Algeria'], ['TN', 'tun', 'Tunisia'], ['IQ', 'irq', 'Iraq'],
    ['IR', 'irn', 'Iran'], ['QA', 'qat', 'Qatar'], ['KW', 'kwt', 'Kuwait'], ['VE', 'ven', 'Venezuela'],
    ['EC', 'ecu', 'Ecuador'], ['SK', 'svk', 'Slovakia'], ['BG', 'bgr', 'Bulgaria'], ['HR', 'hrv', 'Croatia'],
    ['RS', 'srb', 'Serbia'], ['LT', 'ltu', 'Lithuania'], ['LV', 'lva', 'Latvia'], ['EE', 'est', 'Estonia'],
    ['SI', 'svn', 'Slovenia'], ['IS', 'isl', 'Iceland'], ['LU', 'lux', 'Luxembourg'], ['CY', 'cyp', 'Cyprus'],
];

const BY_ISO3 = new Map(COUNTRIES.map(([i2, i3, n]) => [i3, { iso2: i2, name: n }]));
const BY_NAME = new Map(COUNTRIES.map(([i2, , n]) => [n.toLowerCase(), i2]));
BY_NAME.set('turkey', 'TR');
BY_NAME.set('czech republic', 'CZ');
BY_NAME.set('uae', 'AE');

export function flagEmoji(iso2: string | null | undefined): string {
    if (!iso2 || !/^[A-Za-z]{2}$/.test(iso2)) return '';
    const up = iso2.toUpperCase();
    return String.fromCodePoint(0x1f1e6 + up.charCodeAt(0) - 65, 0x1f1e6 + up.charCodeAt(1) - 65);
}

/** GSC 'usa' -> { name: 'United States', flag: '🇺🇸' }. */
export function countryFromIso3(code: string): { name: string; flag: string } {
    const c = BY_ISO3.get(code.toLowerCase());
    return c ? { name: c.name, flag: flagEmoji(c.iso2) } : { name: code.toUpperCase(), flag: '' };
}

/** GA4 'United States' -> '🇺🇸'. */
export function flagForName(name: string): string {
    return flagEmoji(BY_NAME.get(name.toLowerCase()) ?? null);
}
