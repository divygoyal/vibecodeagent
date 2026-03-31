'use client';

import { useState, useRef, useEffect } from 'react';
import { Filter, Plus, X, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFilterStore, type FilterRule } from '@/stores/analyticsFilterStore';

const FILTER_PARAMS = [
    { value: 'country', label: 'Country' },
    { value: 'city', label: 'City' },
    { value: 'region', label: 'Region' },
    { value: 'language', label: 'Language' },
    { value: 'device', label: 'Device' },
    { value: 'browser', label: 'Browser' },
    { value: 'os', label: 'OS' },
    { value: 'referrer', label: 'Referrer' },
    { value: 'channel', label: 'Channel' },
    { value: 'page', label: 'Page' },
    { value: 'hostname', label: 'Hostname' },
    { value: 'entry_page', label: 'Entry Page' },
    { value: 'exit_page', label: 'Exit Page' },
    { value: 'utm_source', label: 'UTM Source' },
    { value: 'utm_medium', label: 'UTM Medium' },
    { value: 'utm_campaign', label: 'UTM Campaign' },
    { value: 'utm_term', label: 'UTM Term' },
    { value: 'utm_content', label: 'UTM Content' },
    { value: 'screen_resolution', label: 'Screen Resolution' },
    { value: 'browser_version', label: 'Browser Version' },
];

const FILTER_TYPES: { value: FilterRule['type']; label: string }[] = [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'not equals' },
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: 'not contains' },
];

function isNegativeFilter(type: FilterRule['type']) {
    return type === 'not_equals' || type === 'not_contains';
}

function filterTypeLabel(type: FilterRule['type']) {
    return FILTER_TYPES.find(t => t.value === type)?.label ?? type;
}

function paramLabel(param: string) {
    return FILTER_PARAMS.find(p => p.value === param)?.label ?? param;
}

// ─── Custom Select Dropdown ───
function SelectDropdown({
    options,
    value,
    onChange,
    placeholder,
}: {
    options: { value: string; label: string }[];
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const selectedLabel = options.find(o => o.value === value)?.label;

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex items-center justify-between gap-1.5 w-full px-2.5 py-1.5 text-[11px] bg-white/[0.04] border border-white/[0.08] rounded-md text-left hover:bg-white/[0.06] hover:border-white/[0.12] transition min-w-[120px]"
            >
                <span className={selectedLabel ? 'text-zinc-200' : 'text-zinc-500'}>
                    {selectedLabel || placeholder}
                </span>
                <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute left-0 top-full mt-1 z-[60] bg-[#0a0a0f] border border-white/[0.1] rounded-lg shadow-2xl shadow-black/50 py-1 min-w-[160px] max-h-[240px] overflow-y-auto scrollbar-hide"
                    >
                        {options.map(opt => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => { onChange(opt.value); setOpen(false); }}
                                className={`w-full text-left px-3 py-1.5 text-[11px] transition ${
                                    value === opt.value
                                        ? 'text-emerald-400 bg-emerald-500/[0.08]'
                                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function FilterBuilder() {
    const { advancedFilters, addAdvancedFilter, removeAdvancedFilter, clearAdvancedFilters } = useFilterStore();
    const [open, setOpen] = useState(false);
    const [param, setParam] = useState('');
    const [type, setType] = useState<FilterRule['type']>('equals');
    const [value, setValue] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Focus input when param is selected
    useEffect(() => {
        if (param && inputRef.current) {
            inputRef.current.focus();
        }
    }, [param]);

    function handleAdd() {
        if (!param || !value.trim()) return;
        addAdvancedFilter({ parameter: param, type, value: value.trim() });
        // Reset form but keep dropdown open for adding more
        setParam('');
        setType('equals');
        setValue('');
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAdd();
        }
    }

    const filterCount = advancedFilters.length;

    return (
        <div ref={dropdownRef} className="relative">
            {/* ─── Trigger Button ─── */}
            <button
                onClick={() => setOpen(!open)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-lg border transition ${
                    filterCount > 0 || open
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-white/[0.03] border-white/[0.04] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.1]'
                }`}
            >
                <Filter className="w-3 h-3" />
                <span className="hidden sm:inline">Filter</span>
                {filterCount > 0 && (
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-bold">
                        {filterCount}
                    </span>
                )}
            </button>

            {/* ─── Dropdown Panel ─── */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 z-50 bg-[#0a0a0f] border border-white/[0.1] rounded-lg shadow-2xl shadow-black/50 p-3 min-w-[380px] sm:min-w-[440px]"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">Add Filter</span>
                            {filterCount > 0 && (
                                <button
                                    onClick={clearAdvancedFilters}
                                    className="text-[10px] text-zinc-600 hover:text-zinc-300 transition"
                                >
                                    Clear all
                                </button>
                            )}
                        </div>

                        {/* Filter Builder Row */}
                        <div className="flex items-center gap-2 mb-3">
                            <SelectDropdown
                                options={FILTER_PARAMS}
                                value={param}
                                onChange={setParam}
                                placeholder="Parameter..."
                            />
                            <SelectDropdown
                                options={FILTER_TYPES}
                                value={type}
                                onChange={(v) => setType(v as FilterRule['type'])}
                                placeholder="Type..."
                            />
                            <input
                                ref={inputRef}
                                type="text"
                                value={value}
                                onChange={e => setValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Value..."
                                className="flex-1 px-2.5 py-1.5 text-[11px] bg-white/[0.04] border border-white/[0.08] rounded-md text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition min-w-[80px]"
                            />
                            <button
                                onClick={handleAdd}
                                disabled={!param || !value.trim()}
                                className="flex items-center justify-center w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Active Advanced Filters */}
                        {filterCount > 0 && (
                            <div className="border-t border-white/[0.06] pt-2.5 space-y-1.5">
                                <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">Active filters</span>
                                <div className="flex flex-wrap gap-1.5">
                                    <AnimatePresence mode="popLayout">
                                        {advancedFilters.map((filter, i) => {
                                            const negative = isNegativeFilter(filter.type);
                                            return (
                                                <motion.button
                                                    key={`${filter.parameter}-${filter.type}-${filter.value}-${i}`}
                                                    layout
                                                    initial={{ scale: 0.9, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    exit={{ scale: 0.9, opacity: 0 }}
                                                    transition={{ duration: 0.12 }}
                                                    onClick={() => removeAdvancedFilter(i)}
                                                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border transition group ${
                                                        negative
                                                            ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/15'
                                                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15'
                                                    }`}
                                                >
                                                    <span className="opacity-70">{paramLabel(filter.parameter)}</span>
                                                    <span className="opacity-50">{filterTypeLabel(filter.type)}</span>
                                                    <span>&quot;{filter.value}&quot;</span>
                                                    <X className={`w-3 h-3 ml-0.5 transition ${
                                                        negative
                                                            ? 'text-red-500/40 group-hover:text-red-300'
                                                            : 'text-emerald-500/40 group-hover:text-emerald-300'
                                                    }`} />
                                                </motion.button>
                                            );
                                        })}
                                    </AnimatePresence>
                                </div>
                            </div>
                        )}

                        {/* Hint */}
                        {filterCount === 0 && (
                            <p className="text-[10px] text-zinc-600 mt-1">
                                Select a parameter, comparison type, and value to create a filter.
                            </p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
