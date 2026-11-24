import React, { useState, useMemo } from 'react';
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  X,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { BankAccount, Category, Transaction } from '../types';
import { FirestoreService, roundMoney } from '../services/firestoreService';
import { useFeedback } from '../contexts/FeedbackContext';

interface ImportStatementModalProps {
  isOpen: boolean;
  userId: string;
  activeWorkspaceId: string;
  accounts: BankAccount[];
  categories: Category[];
  existingTransactions: Transaction[];
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedRow {
  rowId: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // positive magnitude
  type: 'INCOME' | 'EXPENSE';
  category_id: string;
  isDuplicate: boolean;
  selected: boolean;
}

const normalizeText = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isSimilarDescription = (a: string, b: string): boolean => {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const wordsA = na.split(' ').filter(w => w.length >= 3);
  const wordsB = new Set(nb.split(' ').filter(w => w.length >= 3));
  if (wordsA.length === 0 || wordsB.size === 0) return false;
  const shared = wordsA.filter(w => wordsB.has(w)).length;
  return shared / Math.max(wordsA.length, wordsB.size) >= 0.5;
};

const parseFlexibleDate = (raw: string): string | null => {
  const clean = raw.trim().replace(/^["']|["']$/g, '');
  if (!clean) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const brMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (brMatch) {
    let [, d, m, y] = brMatch;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // OFX YYYYMMDD...
  const ofxMatch = clean.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofxMatch) {
    const [, y, m, d] = ofxMatch;
    return `${y}-${m}-${d}`;
  }

  return null;
};

const parseFlexibleAmount = (raw: string): number | null => {
  let s = raw.trim().replace(/^["']|["']$/g, '').replace(/R\$\s*/gi, '').replace(/\s+/g, '');
  if (!s) return null;

  const isNegative = s.startsWith('-') || (s.startsWith('(') && s.endsWith(')'));
  s = s.replace(/[()+-]/g, '');

  // Handle Brazilian format (1.234,56) vs US format (1,234.56)
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }

  const num = parseFloat(s);
  if (isNaN(num)) return null;
  return roundMoney(isNegative ? -Math.abs(num) : Math.abs(num));
};

const splitCsvLine = (line: string, delimiter: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
};

const parseOfxText = (content: string): Array<{ date: string; description: string; signedAmount: number }> => {
  const items: Array<{ date: string; description: string; signedAmount: number }> = [];
  const blocks = content.split(/<STMTTRN>/i).slice(1);

  for (const block of blocks) {
    const endIdx = block.search(/<\/STMTTRN>/i);
    const segment = endIdx >= 0 ? block.slice(0, endIdx) : block;

    const getTag = (tag: string): string => {
      const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
      const m = segment.match(regex);
      return m ? m[1].trim() : '';
    };

    const rawDate = getTag('DTPOSTED');
    const rawAmt = getTag('TRNAMT');
    const memo = getTag('MEMO');
    const name = getTag('NAME');

    const date = parseFlexibleDate(rawDate);
    const signedAmount = parseFlexibleAmount(rawAmt);
    const description = (memo || name || 'Lançamento OFX').trim();

    if (date && signedAmount !== null && signedAmount !== 0) {
      items.push({ date, description, signedAmount });
    }
  }

  return items;
};

export const ImportStatementModal: React.FC<ImportStatementModalProps> = ({
  isOpen,
  userId,
  activeWorkspaceId,
  accounts,
  categories,
  existingTransactions,
  onClose,
  onSuccess
}) => {
  const { showToast } = useFeedback();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState<string>('');
  const [fileFormat, setFileFormat] = useState<'CSV' | 'OFX' | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // CSV Column Mapping State
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRawRows, setCsvRawRows] = useState<string[][]>([]);
  const [colDateIdx, setColDateIdx] = useState<number>(0);
  const [colDescIdx, setColDescIdx] = useState<number>(1);
  const [colAmountIdx, setColAmountIdx] = useState<number>(2);

  // Step 2: Preview Rows & Target Account
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [destAccountId, setDestAccountId] = useState<string>(accounts[0]?.id || '');
  const [importing, setImporting] = useState<boolean>(false);

  // Step 3: Summary Result
  const [summary, setSummary] = useState<{
    imported: number;
    skippedDuplicates: number;
    skippedUnchecked: number;
    netDelta: number;
  } | null>(null);

  const defaultExpenseCatId = useMemo(
    () => categories.find(c => c.type === 'EXPENSE')?.id || 'cat_expense',
    [categories]
  );
  const defaultIncomeCatId = useMemo(
    () => categories.find(c => c.type === 'INCOME')?.id || 'cat_income',
    [categories]
  );

  if (!isOpen) return null;

  const resetAll = () => {
    setStep(1);
    setFileName('');
    setFileFormat(null);
    setParseError(null);
    setCsvHeaders([]);
    setCsvRawRows([]);
    setParsedRows([]);
    setDestAccountId(accounts[0]?.id || '');
    setSummary(null);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const buildPreviewRows = (
    rawItems: Array<{ date: string; description: string; signedAmount: number }>
  ): ParsedRow[] => {
    return rawItems.map((item, idx) => {
      const type: 'INCOME' | 'EXPENSE' = item.signedAmount >= 0 ? 'INCOME' : 'EXPENSE';
      const amount = roundMoney(Math.abs(item.signedAmount));

      // Duplicate detection: same date + same rounded amount + similar description
      const isDuplicate = existingTransactions.some(
        tx =>
          tx.date === item.date &&
          roundMoney(tx.amount) === amount &&
          isSimilarDescription(tx.description, item.description)
      );

      return {
        rowId: `imp_row_${idx}`,
        date: item.date,
        description: item.description,
        amount,
        type,
        category_id: type === 'INCOME' ? defaultIncomeCatId : defaultExpenseCatId,
        isDuplicate,
        selected: !isDuplicate
      };
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = ev => {
      const text = String(ev.target?.result || '').replace(/^\uFEFF/, '');
      if (!text.trim()) {
        setParseError('O arquivo selecionado está vazio.');
        return;
      }

      const lowerName = file.name.toLowerCase();
      const looksLikeOfx =
        lowerName.endsWith('.ofx') ||
        lowerName.endsWith('.qfx') ||
        /<OFX>|<STMTTRN>/i.test(text);

      if (looksLikeOfx) {
        const ofxItems = parseOfxText(text);
        if (ofxItems.length === 0) {
          setParseError('Nenhum lançamento <STMTTRN> válido encontrado neste arquivo OFX.');
          return;
        }
        setFileFormat('OFX');
        setParsedRows(buildPreviewRows(ofxItems));
        if (!destAccountId && accounts[0]?.id) setDestAccountId(accounts[0].id);
        setStep(2);
      } else {
        // CSV Parsing with auto-delimiter detection (';' or ',')
        const lines = text
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(Boolean);
        if (lines.length < 2) {
          setParseError('O CSV precisa conter cabeçalho e ao menos uma linha de lançamento.');
          return;
        }

        const semicolonCount = (lines[0].match(/;/g) || []).length;
        const commaCount = (lines[0].match(/,/g) || []).length;
        const delimiter = semicolonCount >= commaCount ? ';' : ',';

        const headers = splitCsvLine(lines[0], delimiter);
        const rows = lines.slice(1).map(l => splitCsvLine(l, delimiter));

        // Auto-detect column indices by header keywords
        const findCol = (patterns: RegExp[], fallback: number) => {
          const found = headers.findIndex(h => patterns.some(rx => rx.test(normalizeText(h))));
          return found >= 0 ? found : Math.min(fallback, Math.max(0, headers.length - 1));
        };

        const dIdx = findCol([/data/, /date/, /dt/], 0);
        const descIdx = findCol([/desc/, /hist/, /estab/, /lanc/, /memo/, /titulo/, /nome/], 1);
        const valIdx = findCol([/valor/, /amount/, /quantia/, /montante/, /preco/, /total/], Math.min(2, headers.length - 1));

        setFileFormat('CSV');
        setCsvHeaders(headers);
        setCsvRawRows(rows);
        setColDateIdx(dIdx);
        setColDescIdx(descIdx);
        setColAmountIdx(valIdx);
        if (!destAccountId && accounts[0]?.id) setDestAccountId(accounts[0].id);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleProceedFromCsvMapping = () => {
    setParseError(null);
    const extracted: Array<{ date: string; description: string; signedAmount: number }> = [];

    for (const cols of csvRawRows) {
      const rawDate = cols[colDateIdx] || '';
      const rawDesc = cols[colDescIdx] || '';
      const rawAmt = cols[colAmountIdx] || '';

      const date = parseFlexibleDate(rawDate);
      const signedAmount = parseFlexibleAmount(rawAmt);
      const description = rawDesc.replace(/^["']|["']$/g, '').trim() || 'Lançamento CSV';

      if (date && signedAmount !== null && signedAmount !== 0) {
        extracted.push({ date, description, signedAmount });
      }
    }

    if (extracted.length === 0) {
      setParseError(
        'Não foi possível ler lançamentos válidos com o mapeamento atual. Ajuste as colunas de Data, Descrição e Valor.'
      );
      return;
    }

    setParsedRows(buildPreviewRows(extracted));
    setStep(2);
  };

  const toggleRowSelection = (rowId: string) => {
    setParsedRows(prev =>
      prev.map(r => (r.rowId === rowId ? { ...r, selected: !r.selected } : r))
    );
  };

  const updateRowCategory = (rowId: string, catId: string) => {
    setParsedRows(prev =>
      prev.map(r => (r.rowId === rowId ? { ...r, category_id: catId } : r))
    );
  };

  const selectedCount = parsedRows.filter(r => r.selected).length;
  const duplicatesCount = parsedRows.filter(r => r.isDuplicate).length;

  const handleConfirmImport = async () => {
    if (!destAccountId) {
      showToast({
        type: 'warning',
        title: 'Conta necessária',
        message: 'Selecione a conta bancária de destino para a importação'
      });
      return;
    }

    const toImport = parsedRows.filter(r => r.selected);
    if (toImport.length === 0) {
      showToast({
        type: 'warning',
        title: 'Nenhum item selecionado',
        message: 'Selecione ao menos um lançamento para importar'
      });
      return;
    }

    setImporting(true);
    try {
      const imported = await FirestoreService.importTransactionsBatch(
        userId,
        destAccountId,
        toImport.map(r => ({
          date: r.date,
          description: r.description,
          amount: r.amount,
          type: r.type,
          category_id: r.category_id
        })),
        activeWorkspaceId
      );

      const skippedDuplicates = parsedRows.filter(r => r.isDuplicate && !r.selected).length;
      const skippedUnchecked = parsedRows.filter(r => !r.isDuplicate && !r.selected).length;
      const netDelta = roundMoney(
        toImport.reduce((acc, r) => acc + (r.type === 'INCOME' ? r.amount : -r.amount), 0)
      );

      setSummary({
        imported,
        skippedDuplicates,
        skippedUnchecked,
        netDelta
      });
      setStep(3);
      showToast({
        type: 'success',
        title: 'Extrato importado',
        message: `${imported} lançamento(s) gravados e saldo da conta atualizado`
      });
      onSuccess();
    } catch (err) {
      console.error(err);
      showToast({
        type: 'error',
        title: 'Erro na importação',
        message: 'Não foi possível concluir a gravação em lote'
      });
    } finally {
      setImporting(false);
    }
  };

  const formatMoney = (v: number) =>
    `R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-surface border border-subtle rounded-2xl p-5 sm:p-6 relative space-y-5 max-h-[92vh] flex flex-col">
        <button
          onClick={handleClose}
          className="absolute top-5 right-5 text-muted hover:text-primary transition-colors"
        >
          <X className="w-4 h-4 stroke-[1.5]" />
        </button>

        {/* Header & Step Indicator */}
        <div>
          <h3 className="text-base font-medium text-primary">
            Importar extrato bancário (CSV / OFX)
          </h3>
          <div className="flex items-center gap-2 mt-3">
            {[
              { n: 1, label: '1. Arquivo' },
              { n: 2, label: '2. Prévia & duplicidades' },
              { n: 3, label: '3. Resumo' }
            ].map(s => (
              <div key={s.n} className="flex-1 space-y-1">
                <div className={`h-1 rounded-full ${step >= s.n ? 'bg-[#10B981]' : 'bg-subtle'}`} />
                <span className={`text-[11px] block ${step === s.n ? 'text-primary font-medium' : 'text-muted'}`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {parseError && (
          <div className="p-3 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg text-xs text-[#EF4444] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{parseError}</span>
          </div>
        )}

        {/* STEP 1: UPLOAD & OPTIONAL CSV MAPPING */}
        {step === 1 && (
          <div className="space-y-4 overflow-y-auto">
            <label className="block border border-dashed border-border-focus hover:border-[#10B981] rounded-xl p-6 sm:p-8 text-center bg-canvas cursor-pointer transition-colors">
              <input
                type="file"
                accept=".csv,.ofx,.qfx,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="w-6 h-6 stroke-[1.5] text-[#10B981] mx-auto mb-2" />
              <p className="text-xs font-medium text-primary">
                {fileName ? `Arquivo carregado: ${fileName}` : 'Clique para selecionar um arquivo .CSV ou .OFX'}
              </p>
              <p className="text-[11px] text-muted mt-1">
                Processamento 100% local no navegador — suporta extratos de Itaú, Nubank, Inter, Bradesco, BTG e padrão OFX
              </p>
            </label>

            {fileFormat === 'CSV' && csvHeaders.length > 0 && (
              <div className="p-4 bg-canvas border border-subtle rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-primary flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-[#10B981]" />
                    Mapeamento de colunas CSV ({csvRawRows.length} linhas detectadas)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-secondary mb-1">Coluna Data</label>
                    <select
                      value={colDateIdx}
                      onChange={e => setColDateIdx(Number(e.target.value))}
                      className="w-full h-9 bg-surface border border-subtle rounded-lg px-2.5 text-xs text-primary outline-none"
                    >
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Coluna ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-secondary mb-1">Coluna Descrição</label>
                    <select
                      value={colDescIdx}
                      onChange={e => setColDescIdx(Number(e.target.value))}
                      className="w-full h-9 bg-surface border border-subtle rounded-lg px-2.5 text-xs text-primary outline-none"
                    >
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Coluna ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-secondary mb-1">Coluna Valor</label>
                    <select
                      value={colAmountIdx}
                      onChange={e => setColAmountIdx(Number(e.target.value))}
                      className="w-full h-9 bg-surface border border-subtle rounded-lg px-2.5 text-xs text-primary outline-none"
                    >
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Coluna ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleProceedFromCsvMapping}
                    className="h-9 px-4 bg-primary hover:opacity-90 text-canvas text-xs font-medium rounded-lg flex items-center gap-1.5 transition-opacity"
                  >
                    <span>Avançar para prévia</span>
                    <ArrowRight className="w-3.5 h-3.5 stroke-[1.5]" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: PREVIEW & DUPLICATE DETECTION */}
        {step === 2 && (
          <div className="flex-1 min-h-0 flex flex-col space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-canvas border border-subtle rounded-xl p-3.5 items-end">
              <div>
                <label className="block text-xs text-secondary mb-1">
                  Conta bancária de destino
                </label>
                <select
                  value={destAccountId}
                  onChange={e => setDestAccountId(e.target.value)}
                  className="w-full h-9 bg-surface border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                >
                  {accounts.length === 0 ? (
                    <option value="">Cadastre uma conta bancária primeiro</option>
                  ) : (
                    accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} — Saldo: {formatMoney(acc.current_balance)}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 text-xs">
                <span className="font-mono text-secondary">
                  {selectedCount} de {parsedRows.length} selecionados
                </span>
                {duplicatesCount > 0 && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#D97706]/15 text-[#D97706] border border-[#D97706]/30">
                    {duplicatesCount} duplicidade(s) sinalizada(s)
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto border border-subtle rounded-xl bg-canvas">
              <table className="w-full text-left text-xs">
                <thead className="bg-deep text-muted border-b border-subtle sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3 w-8">
                      <input
                        type="checkbox"
                        checked={selectedCount === parsedRows.length && parsedRows.length > 0}
                        onChange={e =>
                          setParsedRows(prev => prev.map(r => ({ ...r, selected: e.target.checked })))
                        }
                        className="accent-[#10B981]"
                      />
                    </th>
                    <th className="py-2.5 px-3 font-normal">Data</th>
                    <th className="py-2.5 px-3 font-normal">Descrição</th>
                    <th className="py-2.5 px-3 font-normal">Categoria</th>
                    <th className="py-2.5 px-3 font-normal text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {parsedRows.map(row => {
                    const rowCats = categories.filter(c => c.type === row.type);
                    return (
                      <tr
                        key={row.rowId}
                        className={`hover:bg-surface-hover transition-colors ${!row.selected ? 'opacity-50' : ''}`}
                      >
                        <td className="py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => toggleRowSelection(row.rowId)}
                            className="accent-[#10B981]"
                          />
                        </td>
                        <td className="py-2.5 px-3 font-mono text-muted whitespace-nowrap">
                          {row.date.split('-').reverse().join('/')}
                        </td>
                        <td className="py-2.5 px-3 max-w-[220px]">
                          <p className="text-primary truncate">{row.description}</p>
                          {row.isDuplicate && (
                            <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#D97706]/15 text-[#D97706] border border-[#D97706]/30">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Possível duplicata
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            value={row.category_id}
                            onChange={e => updateRowCategory(row.rowId, e.target.value)}
                            className="h-7 bg-surface border border-subtle rounded px-2 text-[11px] text-primary outline-none max-w-[150px]"
                          >
                            {rowCats.length === 0 ? (
                              <option value={row.category_id}>Geral</option>
                            ) : (
                              rowCats.map(c => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))
                            )}
                          </select>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium whitespace-nowrap tabular-nums">
                          <span className={row.type === 'INCOME' ? 'text-[#10B981]' : 'text-primary'}>
                            {row.type === 'INCOME' ? '+' : '-'}
                            {formatMoney(row.amount)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-subtle">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="h-9 px-3 text-xs text-secondary hover:text-primary flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5 stroke-[1.5]" />
                <span>Voltar</span>
              </button>
              <button
                type="button"
                disabled={importing || selectedCount === 0 || !destAccountId}
                onClick={handleConfirmImport}
                className="h-9 px-4 bg-[#10B981] hover:bg-[#059669] disabled:opacity-40 text-[#0A0A0A] font-medium text-xs rounded-lg transition-colors"
              >
                {importing ? 'Importando em lote...' : `Importar ${selectedCount} lançamento(s)`}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SUMMARY */}
        {step === 3 && summary && (
          <div className="space-y-4 py-2">
            <div className="p-6 bg-canvas border border-[#10B981]/30 rounded-xl text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 stroke-[1.5] text-[#10B981] mx-auto" />
              <h4 className="text-sm font-medium text-primary">Importação concluída com sucesso</h4>
              <p className="text-xs text-secondary font-mono">
                {summary.imported} importados • {summary.skippedDuplicates} duplicados ignorados
                {summary.skippedUnchecked > 0 ? ` • ${summary.skippedUnchecked} desmarcados` : ''}
              </p>
              <p className="text-xs text-muted pt-1">
                Impacto líquido aplicado à conta:{' '}
                <span className={summary.netDelta >= 0 ? 'text-[#10B981] font-mono' : 'text-primary font-mono'}>
                  {summary.netDelta >= 0 ? '+' : '-'}
                  {formatMoney(summary.netDelta)}
                </span>
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="h-9 px-5 bg-primary hover:opacity-90 text-canvas text-xs font-medium rounded-lg transition-opacity"
              >
                Concluir
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
