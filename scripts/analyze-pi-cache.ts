#!/usr/bin/env npx tsx

/**
 * Analyze cached PI data for physically impossible values
 * 
 * This script reads the cached PI calculation results and validates
 * them against physical constraints (SST requirements, historical records, etc.)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getPICacheDir } from '../lib/cache-config';

interface PIGridPoint {
  lat: number;
  lon: number;
  sst: number;
  vmax: number;
  pmin: number;
  category: string;
}

interface PIDataResponse {
  sstDate: string;
  atmosphericDate: string;
  gridPoints: PIGridPoint[];
  pointCount: number;
}

interface AnalyzedValue {
  lat: number;
  lon: number;
  sst: number;
  vmax: number;
  pmin: number;
  category: string;
  issues: string[];
}

async function findLatestPICache(): Promise<string | null> {
  const cacheDir = getPICacheDir();
  try {
    const files = await fs.readdir(cacheDir);
    const piFiles = files.filter(f => f.startsWith('pi-') && f.endsWith('.json'));
    if (piFiles.length === 0) {
      return null;
    }
    // Sort by modification time, get latest
    const fileStats = await Promise.all(
      piFiles.map(async (f) => {
        const filePath = path.join(cacheDir, f);
        const stats = await fs.stat(filePath);
        return { file: f, path: filePath, mtime: stats.mtime };
      })
    );
    fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    return fileStats[0].path;
  } catch (error) {
    console.error('Error reading cache directory:', error);
    return null;
  }
}

async function analyzePIData(): Promise<void> {
  console.log('🔍 Analyzing cached PI data...\n');
  
  const cachePath = await findLatestPICache();
  if (!cachePath) {
    console.error('❌ No PI cache files found');
    process.exit(1);
  }
  
  console.log(`📁 Reading cache: ${path.basename(cachePath)}`);
  
  try {
    const fileContent = await fs.readFile(cachePath, 'utf-8');
    const data: PIDataResponse = JSON.parse(fileContent);
    
    console.log(`✓ Loaded ${data.pointCount} points`);
    console.log(`  SST date: ${data.sstDate}`);
    console.log(`  Atmospheric date: ${data.atmosphericDate}\n`);
    
    // Analyze all points
    const allAnalyzed: AnalyzedValue[] = [];
    const physicallyImpossible: AnalyzedValue[] = [];
    
    for (const point of data.gridPoints) {
      const issues: string[] = [];
      
      // Physical validation rules
      if (point.vmax > 195) {
        issues.push(`vmax ${point.vmax.toFixed(1)}kt exceeds historical record (~195kt)`);
      }
      if (point.pmin < 870) {
        issues.push(`pmin ${point.pmin.toFixed(1)}mb below historical record (~870mb)`);
      }
      if (point.category === 'Cat5' && point.sst < 28) {
        issues.push(`Cat5 with SST ${point.sst.toFixed(1)}°C (requires >=28°C)`);
      }
      if (point.category === 'Cat4' && point.sst < 27) {
        issues.push(`Cat4 with SST ${point.sst.toFixed(1)}°C (requires >=27°C)`);
      }
      if ((point.category === 'Cat3' || point.category === 'Cat2' || point.category === 'Cat1') && point.sst < 26.5) {
        issues.push(`${point.category} with SST ${point.sst.toFixed(1)}°C (requires >=26.5°C)`);
      }
      if (point.vmax >= 64 && point.sst < 26.5) {
        issues.push(`Tropical storm/hurricane (${point.vmax.toFixed(1)}kt) with SST ${point.sst.toFixed(1)}°C (requires >=26.5°C)`);
      }
      
      const analyzed: AnalyzedValue = {
        ...point,
        issues,
      };
      
      allAnalyzed.push(analyzed);
      if (issues.length > 0) {
        physicallyImpossible.push(analyzed);
      }
    }
    
    // Overall statistics
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 OVERALL STATISTICS');
    console.log('═══════════════════════════════════════════════════════════');
    
    // Calculate statistics efficiently (avoid stack overflow with large arrays)
    let minVmax = Infinity, maxVmax = -Infinity, sumVmax = 0;
    let minPmin = Infinity, maxPmin = -Infinity, sumPmin = 0;
    let minSST = Infinity, maxSST = -Infinity, sumSST = 0;
    const categoryCounts: Record<string, number> = {};
    
    for (const v of allAnalyzed) {
      if (v.vmax < minVmax) minVmax = v.vmax;
      if (v.vmax > maxVmax) maxVmax = v.vmax;
      sumVmax += v.vmax;
      
      if (v.pmin < minPmin) minPmin = v.pmin;
      if (v.pmin > maxPmin) maxPmin = v.pmin;
      sumPmin += v.pmin;
      
      if (v.sst < minSST) minSST = v.sst;
      if (v.sst > maxSST) maxSST = v.sst;
      sumSST += v.sst;
      
      categoryCounts[v.category] = (categoryCounts[v.category] || 0) + 1;
    }
    
    console.log(`Vmax: min=${minVmax.toFixed(1)}kt, max=${maxVmax.toFixed(1)}kt, avg=${(sumVmax / allAnalyzed.length).toFixed(1)}kt`);
    console.log(`Pmin: min=${minPmin.toFixed(1)}mb, max=${maxPmin.toFixed(1)}mb, avg=${(sumPmin / allAnalyzed.length).toFixed(1)}mb`);
    console.log(`SST: min=${minSST.toFixed(1)}°C, max=${maxSST.toFixed(1)}°C, avg=${(sumSST / allAnalyzed.length).toFixed(1)}°C`);
    console.log(`Categories: Cat5=${categoryCounts['Cat5'] || 0}, Cat4=${categoryCounts['Cat4'] || 0}, Cat3=${categoryCounts['Cat3'] || 0}, Cat2=${categoryCounts['Cat2'] || 0}, Cat1=${categoryCounts['Cat1'] || 0}, TS=${categoryCounts['TS'] || 0}, TD=${categoryCounts['TD'] || 0}`);
    
    console.log(`\n⚠️  Points with physical impossibilities: ${physicallyImpossible.length} (${((physicallyImpossible.length / allAnalyzed.length) * 100).toFixed(1)}%)`);
    
    // Group by issue type
    const issuesByType: Record<string, AnalyzedValue[]> = {};
    physicallyImpossible.forEach(v => {
      v.issues.forEach(issue => {
        if (!issuesByType[issue]) {
          issuesByType[issue] = [];
        }
        issuesByType[issue].push(v);
      });
    });
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🚨 ISSUES BY TYPE');
    console.log('═══════════════════════════════════════════════════════════');
    Object.entries(issuesByType).forEach(([issue, values]) => {
      console.log(`"${issue}": ${values.length} occurrences`);
    });
    
    // Show ALL physically impossible values
    if (physicallyImpossible.length > 0) {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('🚨 ALL PHYSICALLY IMPOSSIBLE VALUES');
      console.log('═══════════════════════════════════════════════════════════');
      physicallyImpossible.forEach((v, idx) => {
        console.log(`\n${idx + 1}. ${v.lat.toFixed(2)}°N, ${v.lon.toFixed(2)}°W: ${v.category} (${v.vmax.toFixed(1)}kt, ${v.pmin.toFixed(1)}mb) with SST ${v.sst.toFixed(1)}°C`);
        v.issues.forEach(issue => {
          console.log(`   ⚠️  ${issue}`);
        });
      });
    } else {
      console.log('\n✅ No physically impossible values found!');
    }
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ Analysis complete');
    console.log('═══════════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('❌ Error analyzing cache:', error);
    process.exit(1);
  }
}

// Run analysis
analyzePIData().catch(console.error);

