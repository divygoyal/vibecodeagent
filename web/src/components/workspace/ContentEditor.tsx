'use client';
import React, { useState, useMemo } from 'react';
import { PenTool, Target, BookOpen, Type, Hash, AlignLeft, BarChart2, Clock } from 'lucide-react';
import FixWithBotButton from '@/components/FixWithBotButton';

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 2) return 1;
  let count = 0;
  let prevVowel = false;
  const vowels = 'aeiouy';
  for (let i = 0; i < w.length; i++) {
    const isVowel = vowels.includes(w[i]);
    if (isVowel && !prevVowel) count++;
    prevVowel = isVowel;
  }
  // silent e
  if (w.endsWith('e') && count > 1) count--;
  return Math.max(count, 1);
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

function scoreRingBg(score: number): string {
  if (score >= 80) return 'ring-emerald-500/30 bg-emerald-500/10';
  if (score >= 60) return 'ring-amber-500/30 bg-amber-500/10';
  return 'ring-red-500/30 bg-red-500/10';
}

interface HeadingInfo {
  h1: number;
  h2: number;
  h3: number;
  warnings: string[];
}

export default function ContentEditor() {
  const [content, setContent] = useState('');
  const [keyword, setKeyword] = useState('');

  const words = useMemo(() => {
    return content.trim() ? content.trim().split(/\s+/) : [];
  }, [content]);

  const wordCount = words.length;
  const charCount = content.length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  // Keyword density
  const keywordDensity = useMemo(() => {
    if (!keyword.trim() || wordCount === 0) return 0;
    const kw = keyword.trim().toLowerCase();
    const text = content.toLowerCase();
    let count = 0;
    let idx = 0;
    while ((idx = text.indexOf(kw, idx)) !== -1) {
      count++;
      idx += kw.length;
    }
    return (count / wordCount) * 100;
  }, [content, keyword, wordCount]);

  const densityColor = useMemo(() => {
    if (keywordDensity >= 1 && keywordDensity <= 3) return 'emerald';
    if ((keywordDensity >= 0.5 && keywordDensity < 1) || (keywordDensity > 3 && keywordDensity <= 5)) return 'amber';
    return 'red';
  }, [keywordDensity]);

  // Readability (Flesch-Kincaid)
  const readability = useMemo(() => {
    if (wordCount === 0) return { score: 0, grade: 'N/A', rating: 'No content' };
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0).length || 1;
    const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
    const score = Math.max(0, Math.min(100,
      206.835 - 1.015 * (wordCount / sentences) - 84.6 * (totalSyllables / wordCount)
    ));
    let grade: string;
    let rating: string;
    if (score >= 80) { grade = '6th'; rating = 'Easy'; }
    else if (score >= 70) { grade = '7th'; rating = 'Fairly Easy'; }
    else if (score >= 60) { grade = '8-9th'; rating = 'Standard'; }
    else if (score >= 50) { grade = '10-12th'; rating = 'Fairly Difficult'; }
    else if (score >= 30) { grade = 'College'; rating = 'Difficult'; }
    else { grade = 'Graduate'; rating = 'Very Difficult'; }
    return { score: Math.round(score), grade, rating };
  }, [content, words, wordCount]);

  // Word count scoring
  const wordCountColor = useMemo(() => {
    if (wordCount < 300) return 'red';
    if (wordCount < 800) return 'amber';
    return 'emerald';
  }, [wordCount]);

  // Heading structure
  const headings = useMemo((): HeadingInfo => {
    const lines = content.split('\n');
    let h1 = 0, h2 = 0, h3 = 0;
    const warnings: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('### ')) h3++;
      else if (trimmed.startsWith('## ')) h2++;
      else if (trimmed.startsWith('# ')) h1++;
    }
    if (h1 === 0 && wordCount > 0) warnings.push('Missing H1 heading');
    if (h1 > 1) warnings.push('Multiple H1 headings detected');
    if (h2 === 0 && wordCount > 100) warnings.push('No H2 subheadings — consider breaking up content');
    return { h1, h2, h3, warnings };
  }, [content, wordCount]);

  // Meta preview
  const metaTitle = useMemo(() => {
    const firstLine = content.split('\n').find(l => l.trim().length > 0) || keyword || '';
    return firstLine.replace(/^#+\s*/, '').trim();
  }, [content, keyword]);

  const metaDescription = useMemo(() => {
    const plainText = content.replace(/^#+\s*.*/gm, '').replace(/\n+/g, ' ').trim();
    return plainText.slice(0, 160);
  }, [content]);

  // Overall score
  const overallScore = useMemo(() => {
    if (wordCount === 0) return 0;
    const densityScore = (keywordDensity >= 1 && keywordDensity <= 3) ? 100
      : (keywordDensity >= 0.5 && keywordDensity <= 5) ? 60 : 20;
    const readabilityScore = readability.score;
    const wordScore = wordCount >= 800 ? 100 : wordCount >= 300 ? 70 : 30;
    const headingScore = headings.warnings.length === 0 ? 100
      : headings.warnings.length === 1 ? 60 : 30;
    const metaScore = (metaTitle.length > 0 && metaTitle.length <= 60) ? 100
      : metaTitle.length > 60 ? 50 : 0;
    return Math.round(
      densityScore * 0.25 +
      readabilityScore * 0.25 +
      wordScore * 0.2 +
      headingScore * 0.15 +
      metaScore * 0.15
    );
  }, [keywordDensity, readability.score, wordCount, headings.warnings, metaTitle]);

  return (
    <div className="premium-card rounded-2xl p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-4 sm:mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center">
          <PenTool className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Content Editor</h2>
          <p className="text-xs text-[var(--text-muted)]">Write and optimize your content with real-time SEO scoring</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Editor Side */}
        <div className="flex-[3] min-w-0 space-y-4">
          {/* Keyword Input */}
          <div className="glass-card rounded-xl p-3 flex items-center gap-3">
            <Target className="w-4 h-4 text-emerald-400 shrink-0" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Target keyword..."
              className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none min-h-[44px]"
            />
          </div>

          {/* Textarea */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Start writing your content here... Use # for headings (markdown supported)"
            className="w-full min-h-[200px] sm:min-h-[400px] p-4 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text-primary)] resize-y focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/30 outline-none transition-all font-mono text-sm leading-relaxed"
          />

          {/* Word + Char count */}
          <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5" />
              {wordCount} words
            </span>
            <span className="flex items-center gap-1.5">
              <AlignLeft className="w-3.5 h-3.5" />
              {charCount} characters
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {readingTime} min read
            </span>
          </div>
        </div>

        {/* Scoring Panel */}
        <div className="flex-[2] min-w-0 space-y-4">
          {/* Overall Score */}
          <div className="premium-card rounded-xl p-4 flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full ring-4 ${scoreRingBg(overallScore)} flex items-center justify-center shrink-0`}>
              <span className={`text-2xl font-bold ${scoreColor(overallScore)}`}>{overallScore}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Overall SEO Score</p>
              <p className="text-xs text-[var(--text-muted)]">
                {overallScore >= 80 ? 'Great! Your content is well optimized.' :
                 overallScore >= 60 ? 'Good, but there\'s room for improvement.' :
                 wordCount === 0 ? 'Start writing to see your score.' :
                 'Needs work. Check the suggestions below.'}
              </p>
            </div>
          </div>

          {/* Keyword Density */}
          <div className="premium-card rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-[var(--text-primary)]">Keyword Density</span>
              </div>
              <span className={`text-sm font-bold text-${densityColor}-400`}>
                {keywordDensity.toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/[0.06]">
              <div
                className={`h-full rounded-full bg-${densityColor}-500 transition-all duration-300`}
                style={{ width: `${Math.min(keywordDensity * 20, 100)}%` }}
              />
            </div>
            <p className="text-xs text-[var(--text-muted)]">Ideal: 1-3%</p>
            {keyword.trim() && (
              <FixWithBotButton
                label="Optimize Density"
                context={`Optimize keyword density for '${keyword}' in this content`}
                variant="ghost"
              />
            )}
          </div>

          {/* Readability */}
          <div className="premium-card rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium text-[var(--text-primary)]">Readability</span>
              </div>
              <span className={`text-sm font-bold ${scoreColor(readability.score)}`}>
                {readability.score}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/[0.06]">
              <div
                className={`h-full rounded-full ${scoreBg(readability.score)} transition-all duration-300`}
                style={{ width: `${readability.score}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Grade Level: {readability.grade}</span>
              <span>{readability.rating}</span>
            </div>
            {wordCount > 0 && (
              <FixWithBotButton
                label="Improve Readability"
                context={`Improve readability of this content. Current score: ${readability.score}`}
                variant="ghost"
              />
            )}
          </div>

          {/* Word Count */}
          <div className="premium-card rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-medium text-[var(--text-primary)]">Content Length</span>
              </div>
              <span className={`text-sm font-bold text-${wordCountColor}-400`}>
                {wordCount}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/[0.06]">
              <div
                className={`h-full rounded-full bg-${wordCountColor}-500 transition-all duration-300`}
                style={{ width: `${Math.min((wordCount / 2000) * 100, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>{readingTime} min reading time</span>
              <span>{wordCount < 300 ? 'Too short' : wordCount < 800 ? 'Getting there' : 'Good length'}</span>
            </div>
          </div>

          {/* Heading Structure */}
          <div className="premium-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-[var(--text-primary)]">Heading Structure</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-white/[0.04] p-2">
                <p className="text-lg font-bold text-[var(--text-primary)]">{headings.h1}</p>
                <p className="text-xs text-[var(--text-muted)]">H1</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] p-2">
                <p className="text-lg font-bold text-[var(--text-primary)]">{headings.h2}</p>
                <p className="text-xs text-[var(--text-muted)]">H2</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] p-2">
                <p className="text-lg font-bold text-[var(--text-primary)]">{headings.h3}</p>
                <p className="text-xs text-[var(--text-muted)]">H3</p>
              </div>
            </div>
            {headings.warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-400 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                {w}
              </p>
            ))}
            {wordCount > 0 && (
              <FixWithBotButton
                label="Fix Headings"
                context="Improve heading structure for this content"
                variant="ghost"
              />
            )}
          </div>

          {/* Meta Preview */}
          <div className="premium-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Type className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-[var(--text-primary)]">Meta Preview</span>
            </div>
            <div className="space-y-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[var(--text-muted)]">Title</span>
                  <span className={`text-xs font-medium ${metaTitle.length <= 60 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {metaTitle.length}/60
                  </span>
                </div>
                <div className="rounded-lg bg-white/[0.04] p-2 text-sm text-[var(--text-primary)] truncate">
                  {metaTitle || 'No title detected'}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[var(--text-muted)]">Description</span>
                  <span className={`text-xs font-medium ${metaDescription.length <= 155 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {metaDescription.length}/160
                  </span>
                </div>
                <div className="rounded-lg bg-white/[0.04] p-2 text-xs text-[var(--text-secondary)] line-clamp-2">
                  {metaDescription || 'No description content detected'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
