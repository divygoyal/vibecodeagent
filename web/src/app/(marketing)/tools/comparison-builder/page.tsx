'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { GitCompareArrows, ArrowLeft, Plus, Trash2, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';

interface Feature {
    name: string;
    values: string[];
}

interface Product {
    name: string;
    description: string;
}

const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

function generateSchemaMarkup(title: string, products: Product[], features: Feature[]): string {
    const schema = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: title,
        mainEntity: {
            '@type': 'ItemList',
            itemListElement: products.map((p, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                item: {
                    '@type': 'Product',
                    name: p.name,
                    description: p.description,
                    additionalProperty: features.map((f) => ({
                        '@type': 'PropertyValue',
                        name: f.name,
                        value: f.values[i] || '',
                    })),
                },
            })),
        },
    };
    return JSON.stringify(schema, null, 2);
}

function generateHTML(title: string, products: Product[], features: Feature[]): string {
    const headerCells = products.map((p) => `      <th>${p.name}</th>`).join('\n');
    const rows = features
        .map(
            (f) =>
                `    <tr>\n      <td><strong>${f.name}</strong></td>\n${f.values.map((v) => `      <td>${v}</td>`).join('\n')}\n    </tr>`
        )
        .join('\n');

    return `<h1>${title}</h1>
<table>
  <thead>
    <tr>
      <th>Feature</th>
${headerCells}
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>

<script type="application/ld+json">
${generateSchemaMarkup(title, products, features)}
</script>`;
}

export default function ComparisonBuilderPage() {
    const [title, setTitle] = useState('');
    const [products, setProducts] = useState<Product[]>([
        { name: '', description: '' },
        { name: '', description: '' },
    ]);
    const [features, setFeatures] = useState<Feature[]>([
        { name: '', values: ['', ''] },
    ]);
    const [generated, setGenerated] = useState(false);
    const [copiedSection, setCopiedSection] = useState<string | null>(null);
    const [showSchema, setShowSchema] = useState(false);
    const [showHTML, setShowHTML] = useState(false);

    const addProduct = () => {
        setProducts([...products, { name: '', description: '' }]);
        setFeatures(features.map((f) => ({ ...f, values: [...f.values, ''] })));
    };

    const removeProduct = (idx: number) => {
        if (products.length <= 2) return;
        setProducts(products.filter((_, i) => i !== idx));
        setFeatures(features.map((f) => ({ ...f, values: f.values.filter((_, i) => i !== idx) })));
    };

    const addFeature = () => {
        setFeatures([...features, { name: '', values: products.map(() => '') }]);
    };

    const removeFeature = (idx: number) => {
        if (features.length <= 1) return;
        setFeatures(features.filter((_, i) => i !== idx));
    };

    const updateProduct = (idx: number, field: keyof Product, value: string) => {
        const updated = [...products];
        updated[idx] = { ...updated[idx], [field]: value };
        setProducts(updated);
    };

    const updateFeatureName = (idx: number, name: string) => {
        const updated = [...features];
        updated[idx] = { ...updated[idx], name };
        setFeatures(updated);
    };

    const updateFeatureValue = (featureIdx: number, productIdx: number, value: string) => {
        const updated = [...features];
        const vals = [...updated[featureIdx].values];
        vals[productIdx] = value;
        updated[featureIdx] = { ...updated[featureIdx], values: vals };
        setFeatures(updated);
    };

    const handleGenerate = () => {
        setGenerated(true);
    };

    const copyToClipboard = (text: string, section: string) => {
        navigator.clipboard.writeText(text);
        setCopiedSection(section);
        setTimeout(() => setCopiedSection(null), 2000);
    };

    const schemaMarkup = generateSchemaMarkup(title, products, features);
    const htmlOutput = generateHTML(title, products, features);
    const isValid = title.trim() && products.every((p) => p.name.trim()) && features.every((f) => f.name.trim());

    return (
        <div className="px-4 pt-10 pb-16 md:px-6">
            <div className="max-w-4xl mx-auto">
                <Link href="/tools" className="inline-flex items-center gap-1.5 text-sm text-fg-secondary hover:text-fg transition-colors mb-8">
                    <ArrowLeft className="w-4 h-4" /> All Tools
                </Link>

                <motion.div initial="hidden" animate="visible" variants={fadeUp}>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2.5 rounded-control bg-brand-soft text-brand-soft-fg">
                            <GitCompareArrows className="w-5 h-5" />
                        </div>
                        <h1 className="text-heading sm:text-heading-lg text-fg">Comparison Builder</h1>
                    </div>
                    <p className="text-sm sm:text-base text-fg-secondary mb-8">
                        Generate professional comparison pages with structured data schema markup.
                    </p>
                </motion.div>

                {/* Builder Form */}
                <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-6">
                    {/* Title */}
                    <div className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
                        <label htmlFor="comparison-title" className="block text-sm font-medium text-fg mb-2">Comparison Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            id="comparison-title"
                            placeholder="e.g., Best Project Management Tools 2026"
                            className="w-full px-4 py-3 min-h-[44px] rounded-lg bg-surface border border-border shadow-xs text-fg placeholder-fg-faint focus:outline-none focus:border-focus transition-colors"
                        />
                    </div>

                    {/* Products */}
                    <div className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold">Products / Items</h2>
                            <button
                                onClick={addProduct}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-subtle text-sm text-fg hover:text-fg hover:bg-subtle-strong transition-colors cursor-pointer"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add
                            </button>
                        </div>
                        <div className="space-y-3">
                            {products.map((p, i) => (
                                <div key={i} className="flex gap-3 items-start">
                                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <input
                                            type="text"
                                            value={p.name}
                                            onChange={(e) => updateProduct(i, 'name', e.target.value)}
                                            aria-label={`Product ${i + 1} name`}
                                            placeholder={`Product ${i + 1} name`}
                                            className="px-3 py-2 rounded-lg bg-surface border border-border shadow-xs text-fg text-sm placeholder-fg-faint focus:outline-none focus:border-focus transition-colors"
                                        />
                                        <input
                                            type="text"
                                            value={p.description}
                                            onChange={(e) => updateProduct(i, 'description', e.target.value)}
                                            aria-label={`Product ${i + 1} description`}
                                            placeholder="Short description"
                                            className="px-3 py-2 rounded-lg bg-surface border border-border shadow-xs text-fg text-sm placeholder-fg-faint focus:outline-none focus:border-focus transition-colors"
                                        />
                                    </div>
                                    {products.length > 2 && (
                                        <button
                                            onClick={() => removeProduct(i)}
                                            aria-label={`Remove product ${i + 1}`}
                                            className="p-2 rounded-lg text-fg-muted hover:text-down hover:bg-down-soft transition-colors cursor-pointer"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Features */}
                    <div className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold">Comparison Features</h2>
                            <button
                                onClick={addFeature}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-subtle text-sm text-fg hover:text-fg hover:bg-subtle-strong transition-colors cursor-pointer"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add Row
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-fg-muted border-b border-border-subtle">
                                        <th className="py-2 pr-3 font-medium">Feature</th>
                                        {products.map((p, i) => (
                                            <th key={i} className="py-2 px-2 font-medium">{p.name || `Product ${i + 1}`}</th>
                                        ))}
                                        <th className="py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {features.map((f, fi) => (
                                        <tr key={fi} className="border-b border-border-subtle">
                                            <td className="py-2 pr-3">
                                                <input
                                                    type="text"
                                                    value={f.name}
                                                    onChange={(e) => updateFeatureName(fi, e.target.value)}
                                                    aria-label={`Feature ${fi + 1} name`}
                                                    placeholder="Feature name"
                                                    className="w-full px-2 py-1.5 rounded bg-surface border border-border shadow-xs text-fg text-xs placeholder-fg-faint focus:outline-none focus:border-focus"
                                                />
                                            </td>
                                            {products.map((_, pi) => (
                                                <td key={pi} className="py-2 px-2">
                                                    <input
                                                        type="text"
                                                        value={f.values[pi] || ''}
                                                        onChange={(e) => updateFeatureValue(fi, pi, e.target.value)}
                                                        aria-label={`${f.name || `Feature ${fi + 1}`}: ${products[pi]?.name || `Product ${pi + 1}`}`}
                                                        placeholder="Value"
                                                        className="w-full px-2 py-1.5 rounded bg-surface border border-border shadow-xs text-fg text-xs placeholder-fg-faint focus:outline-none focus:border-focus"
                                                    />
                                                </td>
                                            ))}
                                            <td className="py-2">
                                                {features.length > 1 && (
                                                    <button
                                                        onClick={() => removeFeature(fi)}
                                                        aria-label={`Remove feature ${fi + 1}`}
                                                        className="p-1 rounded text-fg-muted hover:text-down transition-colors cursor-pointer"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Generate Button */}
                    <button
                        onClick={handleGenerate}
                        disabled={!isValid}
                        className="w-full py-3 min-h-[44px] rounded-control bg-brand text-brand-fg font-semibold text-sm hover:bg-brand-hover transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                        Generate Comparison
                    </button>
                </motion.div>

                {/* Generated Output */}
                {generated && isValid && (
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
                        className="mt-8 space-y-6"
                    >
                        {/* Preview Table */}
                        <motion.div variants={fadeUp} className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
                            <h2 className="text-lg font-semibold mb-4">Preview</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-surface-sunken">
                                            <th className="py-3 px-4 text-left font-semibold text-fg border border-border-subtle">Feature</th>
                                            {products.map((p, i) => (
                                                <th key={i} className="py-3 px-4 text-left font-semibold text-up border border-border-subtle">{p.name}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {features.map((f, fi) => (
                                            <tr key={fi} className={fi % 2 === 0 ? '' : 'bg-surface-sunken'}>
                                                <td className="py-2.5 px-4 font-medium text-fg border border-border-subtle">{f.name}</td>
                                                {f.values.map((v, vi) => (
                                                    <td key={vi} className="py-2.5 px-4 text-fg-secondary border border-border-subtle">{v}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>

                        {/* Schema Markup */}
                        <motion.div variants={fadeUp} className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
                            <div className="flex items-center justify-between mb-3">
                                <button
                                    onClick={() => setShowSchema(!showSchema)}
                                    className="flex items-center gap-2 text-lg font-semibold cursor-pointer"
                                >
                                    Schema Markup (JSON-LD)
                                    {showSchema ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                                <button
                                    onClick={() => copyToClipboard(schemaMarkup, 'schema')}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-subtle text-sm text-fg hover:text-fg hover:bg-subtle-strong transition-colors cursor-pointer"
                                >
                                    {copiedSection === 'schema' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    {copiedSection === 'schema' ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                            {showSchema && (
                                <pre className="text-xs font-mono text-fg-secondary bg-surface-sunken rounded-lg p-4 overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap">
                                    {schemaMarkup}
                                </pre>
                            )}
                        </motion.div>

                        {/* HTML Output */}
                        <motion.div variants={fadeUp} className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
                            <div className="flex items-center justify-between mb-3">
                                <button
                                    onClick={() => setShowHTML(!showHTML)}
                                    className="flex items-center gap-2 text-lg font-semibold cursor-pointer"
                                >
                                    HTML Code
                                    {showHTML ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                                <button
                                    onClick={() => copyToClipboard(htmlOutput, 'html')}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-subtle text-sm text-fg hover:text-fg hover:bg-subtle-strong transition-colors cursor-pointer"
                                >
                                    {copiedSection === 'html' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    {copiedSection === 'html' ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                            {showHTML && (
                                <pre className="text-xs font-mono text-fg-secondary bg-surface-sunken rounded-lg p-4 overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap">
                                    {htmlOutput}
                                </pre>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
