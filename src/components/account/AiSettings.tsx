"use client";

import { useState } from "react";
import { KeyRound, Loader2, Plus, PlugZap, Save, ShieldCheck, Trash2 } from "lucide-react";
import { playMechanicalClick } from "@/lib/audio";
import { showToast } from "@/lib/bus";

interface MaskedProvider {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
}

interface ProviderRow extends MaskedProvider {
  apiKey: string;
}

const INPUT =
  "w-full bg-smartisan-sunken border border-smartisan-line rounded-lg px-3 py-2.5 text-xs font-mono text-smartisan-text placeholder:text-smartisan-faint outline-none focus:border-smartisan-red/50 transition";

function toRows(providers: MaskedProvider[]): ProviderRow[] {
  return providers.map((provider) => ({ ...provider, apiKey: "" }));
}

export default function AiSettings({
  storage,
  initialProviders,
  initialDefaultProviderId,
  initialUpdatedAt,
}: {
  storage: "kv" | "local" | "none";
  initialProviders: MaskedProvider[];
  initialDefaultProviderId: string;
  initialUpdatedAt: string | null;
}) {
  const ready = storage !== "none";
  const [rows, setRows] = useState<ProviderRow[]>(() => toRows(initialProviders));
  const [defaultProviderId, setDefaultProviderId] = useState(initialDefaultProviderId);
  const [savedIds, setSavedIds] = useState<string[]>(() =>
    initialProviders.map((provider) => provider.id)
  );
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [testingId, setTestingId] = useState("");

  const patchRow = (id: string, patch: Partial<ProviderRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  };

  const addRow = () => {
    playMechanicalClick(900, 0.04);
    setRows((prev) => {
      let seq = prev.length + 1;
      let id = `provider-${seq}`;
      while (prev.some((row) => row.id === id)) {
        seq += 1;
        id = `provider-${seq}`;
      }
      return [
        ...prev,
        { id, label: "", baseUrl: "", model: "", apiKey: "", apiKeyMasked: "" },
      ];
    });
  };

  const removeRow = (id: string) => {
    playMechanicalClick(700, 0.04);
    setRows((prev) => prev.filter((row) => row.id !== id));
    if (defaultProviderId === id) setDefaultProviderId("");
  };

  const save = async () => {
    if (saving || !ready) return;
    if (rows.length === 0) {
      showToast("至少保留一个供应商");
      return;
    }
    setSaving(true);
    playMechanicalClick(1100, 0.05);
    try {
      const response = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providers: rows.map((row) => ({
            id: row.id,
            label: row.label,
            baseUrl: row.baseUrl,
            model: row.model,
            apiKey: row.apiKey,
          })),
          defaultProviderId,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        config?: {
          providers: MaskedProvider[];
          defaultProviderId: string;
          updatedAt: string;
        } | null;
      };
      if (!response.ok) {
        showToast(data.error ?? "保存失败");
        return;
      }
      const saved = data.config;
      if (saved) {
        setRows(toRows(saved.providers));
        setDefaultProviderId(saved.defaultProviderId);
        setSavedIds(saved.providers.map((provider) => provider.id));
        setUpdatedAt(saved.updatedAt);
      }
      showToast("AI 配置已加密保存");
    } catch {
      showToast("保存失败，请稍后再试");
    } finally {
      setSaving(false);
    }
  };

  const test = async (id: string) => {
    if (testingId) return;
    if (!savedIds.includes(id)) {
      showToast("请先保存该供应商，再测试连接");
      return;
    }
    setTestingId(id);
    try {
      const response = await fetch(
        `/api/settings/ai?action=test&provider=${encodeURIComponent(id)}`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as {
        result?: { ok: boolean; kind: string; message: string };
        error?: string;
      };
      showToast(data.result?.message ?? data.error ?? "测试失败");
    } catch {
      showToast("测试失败，请检查网络");
    } finally {
      setTestingId("");
    }
  };

  const clear = async () => {
    if (clearing) return;
    if (!window.confirm("确定清除全部 AI 供应商配置吗？此操作不可恢复。")) return;
    setClearing(true);
    try {
      const response = await fetch("/api/settings/ai", { method: "DELETE" });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        showToast(data.error ?? "清除失败");
        return;
      }
      setRows([]);
      setDefaultProviderId("");
      setSavedIds([]);
      setUpdatedAt(null);
      showToast("AI 配置已清除");
    } catch {
      showToast("清除失败，请稍后再试");
    } finally {
      setClearing(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-smartisan-hairline pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-smartisan-gold shadow-gold-glow" />
          <h2 className="font-serif text-lg sm:text-xl font-bold text-smartisan-ink tracking-wider">
            供应商
          </h2>
        </div>
        <span className="font-mono text-[10px] text-smartisan-muted tracking-widest">
          {rows.length} PROVIDERS
        </span>
      </div>

      <div className="st-well rounded-xl p-4 flex items-start gap-2.5">
        <ShieldCheck
          size={14}
          className={storage === "none" ? "text-smartisan-muted mt-0.5" : "text-smartisan-gold mt-0.5"}
        />
        <div className="space-y-1 min-w-0">
          <p className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
            {storage === "kv"
              ? "Storage · Cloudflare KV"
              : storage === "local"
                ? "Storage · Local Fallback"
                : "Storage · Not Configured"}
          </p>
          <p className="text-[11px] text-smartisan-muted font-sans leading-5">
            {storage === "kv"
              ? "配置已加密写入 KV，部署环境所有实例共享同一份。"
              : storage === "local"
                ? "本地开发未配置 KV，将写入 .ai-config.local.json（已在 .gitignore 中忽略）。"
                : "未配置 CF_KV_NAMESPACE_ID 与 CF_API_TOKEN，保存与测试不可用。"}
          </p>
          {updatedAt ? (
            <p className="font-mono text-[10px] text-smartisan-faint">
              UPDATED {updatedAt.replace("T", " ").slice(0, 19)}
            </p>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="st-well rounded-xl p-10 text-center space-y-3">
          <p className="text-sm text-smartisan-muted font-sans">还没有 AI 供应商，先添加一个。</p>
          <button
            type="button"
            onClick={addRow}
            disabled={!ready}
            className="st-btn px-4 py-2 rounded-lg text-xs font-sans text-smartisan-ink inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            <Plus size={12} className="text-smartisan-red" />
            添加供应商
          </button>
        </div>
      ) : null}

      <div className="space-y-3">
        {rows.map((row, index) => {
          const isDefault = row.id === defaultProviderId;
          const isSaved = savedIds.includes(row.id);
          return (
            <div key={row.id} className="st-card rounded-xl p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[10px] tracking-widest text-smartisan-faint">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="ai-default-provider"
                      checked={isDefault}
                      onChange={() => setDefaultProviderId(row.id)}
                      disabled={!ready}
                      className="accent-smartisan-red"
                    />
                    <span className="font-mono text-[10px] tracking-widest text-smartisan-muted">
                      默认
                    </span>
                  </label>
                  {!isSaved ? (
                    <span className="font-mono text-[10px] text-smartisan-gold">未保存</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void test(row.id)}
                    disabled={!ready || !isSaved || Boolean(testingId)}
                    className="st-btn px-3 py-1.5 rounded-lg text-[11px] font-sans text-smartisan-muted hover:text-smartisan-ink inline-flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {testingId === row.id ? (
                      <Loader2 size={11} className="animate-spin text-smartisan-gold" />
                    ) : (
                      <PlugZap size={11} />
                    )}
                    测试
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="st-btn w-8 h-8 rounded-lg flex items-center justify-center text-smartisan-muted hover:text-smartisan-red"
                    aria-label="移除供应商"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1.5 block">
                  <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                    名称 · Label
                  </span>
                  <input
                    value={row.label}
                    onChange={(event) => patchRow(row.id, { label: event.target.value })}
                    placeholder="例如：DeepSeek"
                    className={INPUT}
                  />
                </label>

                <label className="space-y-1.5 block">
                  <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                    ID · 唯一标识
                  </span>
                  <input
                    value={row.id}
                    onChange={(event) => patchRow(row.id, { id: event.target.value })}
                    placeholder="deepseek"
                    className={`${INPUT} text-smartisan-gold`}
                  />
                </label>

                <label className="space-y-1.5 block sm:col-span-2">
                  <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                    BaseURL · 必须 HTTPS
                  </span>
                  <input
                    value={row.baseUrl}
                    onChange={(event) => patchRow(row.id, { baseUrl: event.target.value })}
                    placeholder="https://api.deepseek.com/v1"
                    className={INPUT}
                  />
                </label>

                <label className="space-y-1.5 block">
                  <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                    模型 · Model
                  </span>
                  <input
                    value={row.model}
                    onChange={(event) => patchRow(row.id, { model: event.target.value })}
                    placeholder="deepseek-chat"
                    className={INPUT}
                  />
                </label>

                <label className="space-y-1.5 block">
                  <span className="font-mono text-[10px] tracking-widest text-smartisan-muted uppercase">
                    Key · {row.apiKeyMasked || "未保存"}
                  </span>
                  <input
                    value={row.apiKey}
                    onChange={(event) => patchRow(row.id, { apiKey: event.target.value })}
                    placeholder={row.apiKeyMasked ? "留空沿用已保存的 Key" : "sk-..."}
                    autoComplete="off"
                    spellCheck={false}
                    className={INPUT}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={addRow}
          disabled={!ready}
          className="st-btn px-4 py-2 rounded-lg text-xs font-sans text-smartisan-muted hover:text-smartisan-ink inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <Plus size={12} />
          添加供应商
        </button>

        <div className="flex items-center gap-2">
          {savedIds.length > 0 ? (
            <button
              type="button"
              onClick={() => void clear()}
              disabled={clearing}
              className="st-btn px-3 py-2 rounded-lg text-xs font-sans text-smartisan-muted hover:text-smartisan-red inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              {clearing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              清除全部
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void save()}
            disabled={!ready || saving}
            className="st-btn px-5 py-2.5 rounded-xl text-sm font-sans text-smartisan-ink flex items-center gap-2 disabled:opacity-40"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin text-smartisan-red" />
            ) : (
              <Save size={14} className="text-smartisan-gold" />
            )}
            {saving ? "加密保存中…" : "保存配置"}
          </button>
        </div>
      </div>

      <p className="font-mono text-[10px] text-smartisan-faint flex items-center gap-1.5">
        <KeyRound size={11} />
        明文 Key 只在本机服务端解密，接口仅回传末 4 位掩码。
      </p>
    </section>
  );
}
