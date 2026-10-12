import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Download, ShieldCheck } from "../components/doodles";
import { useAppStore } from "../store/useAppStore";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  MockBadge,
  PageHeader,
  RequireProfile,
  SectionTitle,
  useToast,
} from "../components/ui";
import { FilePreview } from "../components/FilePreview";
import { fileService, downloadBlob, validateFile } from "../services/files";
import { aiService } from "../services/ai";
import {
  MATERIAL_STATUS,
  MATERIAL_TYPES,
  fullDate,
  now,
  uid,
} from "../constants";
import type { Material, MaterialType } from "../types";
const emptyMaterial = (): Omit<Material, "id" | "createdAt" | "updatedAt"> => ({
  name: "",
  type: "other",
  status: "pending",
  isCurrent: true,
  eventIds: [],
  extractionStatus: "none",
});
export function MaterialUploadPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const saveMaterial = useAppStore((s) => s.saveMaterial);
  const materials = useAppStore((s) => s.materials);
  const events = useAppStore((s) => s.events);
  const consume = useAppStore((s) => s.consumeMockConfig);
  const editId = params.get("edit");
  const existing = editId ? materials.find((m) => m.id === editId) : undefined;
  const [form, setForm] = useState<
    Omit<Material, "id" | "createdAt" | "updatedAt">
  >(
    existing || {
      ...emptyMaterial(),
      type: (params.get("type") as MaterialType) || "other",
      eventIds: params.get("eventId") ? [params.get("eventId")!] : [],
    },
  );
  const [file, setFile] = useState<File | null>(null);
  const [stored, setStored] = useState<
    { blob: Blob; name: string; type: string } | undefined
  >();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  useEffect(() => {
    if (existing?.fileId) {
      fileService
        .get(existing.fileId)
        .then((f) => setStored(f))
        .catch((e) => setError(e.message));
    }
  }, [existing?.fileId]);
  const pickFile = (selected?: File | null) => {
    setFileError("");
    setFile(null);
    setDraft("");
    if (!selected) return;
    try {
      validateFile(selected);
      setFile(selected);
    } catch (e) {
      setFileError((e as Error).message);
    }
  };
  const extract = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const text = await aiService.extract(file, consume());
      setDraft(text);
      setForm((prev) => ({
        ...prev,
        extractionStatus: "draft",
        extractionDraft: text,
      }));
      toast("已生成模拟提取结果，请核对后确认");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (!form.name.trim()) {
      setError("请填写材料名称。");
      return;
    }
    setBusy(true);
    try {
      let fileId = existing?.fileId;
      let fileName = existing?.fileName;
      let mimeType = existing?.mimeType;
      let fileSize = existing?.fileSize;
      if (file) {
        fileId = await fileService.put(file);
        fileName = file.name;
        mimeType = file.type;
        fileSize = file.size;
      }
      const original = fileId ? await fileService.get(fileId) : undefined;
      const status = fileId
        ? "uploaded"
        : form.status === "saved_externally"
          ? "saved_externally"
          : "pending";
      saveMaterial(
        {
          ...form,
          id: existing?.id,
          sha256: original?.sha256 || existing?.sha256,
          uploadedAt: original?.uploadedAt || existing?.uploadedAt,
          name: form.name.trim(),
          status,
          fileId,
          fileName,
          mimeType,
          fileSize,
          extractionDraft: draft || form.extractionDraft,
          extractionStatus:
            form.extractionStatus === "confirmed"
              ? "confirmed"
              : draft
                ? "draft"
                : "none",
        },
        params.get("suggestionId") || undefined,
      );
      // 完成状态由覆盖范围与材料匹配规则核对，不因点击保存强行完成。
      toast("材料已保存");
      navigate(
        form.eventIds[0]
          ? `/events/${form.eventIds[0]}`
          : "/review?tab=materials",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const previewBlob = file
    ? { blob: file, name: file.name, type: file.type }
    : stored;
  return (
    <RequireProfile>
      <div className="page stack">
        <PageHeader
          title={existing ? "更新材料信息" : "上传材料"}
          subtitle="先看看材料库里有没有，避免重复收集同样的东西。"
          back="/review?tab=materials"
        />
        {error && <ErrorState message={error} onRetry={() => setError("")} />}
        <div className="card stack">
          <SectionTitle title="材料信息" />
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="name">
                材料名称
              </label>
              <input
                id="name"
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：2026 年 10 月工资条"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="type">
                材料类型
              </label>
              <select
                id="type"
                className="input"
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as MaterialType })
                }
              >
                {Object.entries(MATERIAL_TYPES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="start">
                覆盖开始日期
              </label>
              <input
                id="start"
                type="date"
                className="input"
                value={form.coverageStart || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    coverageStart: e.target.value || undefined,
                  })
                }
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="end">
                覆盖结束日期
              </label>
              <input
                id="end"
                type="date"
                className="input"
                value={form.coverageEnd || ""}
                onChange={(e) =>
                  setForm({ ...form, coverageEnd: e.target.value || undefined })
                }
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isCurrent}
              onChange={(e) =>
                setForm({ ...form, isCurrent: e.target.checked })
              }
            />
            当前仍然有效
          </label>
          {form.coverageStart &&
            form.coverageEnd &&
            form.coverageStart > form.coverageEnd && (
              <p className="error">开始日期不能晚于结束日期。</p>
            )}
          <div className="field">
            <label className="label" htmlFor="loc">
              保存位置备注（用于“已自行保存”）
            </label>
            <input
              id="loc"
              className="input"
              value={form.externalLocationNote || ""}
              onChange={(e) =>
                setForm({ ...form, externalLocationNote: e.target.value })
              }
              placeholder="例如：个人邮箱 / 家中资料夹"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="event">
              关联事件
            </label>
            <select
              id="event"
              className="input"
              value={form.eventIds[0] || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  eventIds: e.target.value ? [e.target.value] : [],
                })
              }
            >
              {!params.get("eventId") && <option value="">不关联事件</option>}
              {events
                .filter((e) => e.status === "confirmed")
                .map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
            </select>
            <p className="small muted">只有已确认的事件可以被关联。</p>
          </div>
          <div className="field">
            <label className="label" htmlFor="note">
              用户备注
            </label>
            <textarea
              id="note"
              className="input min-h-20"
              value={form.note || ""}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
        </div>
        <div className="card stack">
          <SectionTitle
            title="原始文件"
            subtitle="支持 PDF、PNG、JPG、TXT，单个文件不超过 20 MB。"
          />
          <input
            id="file"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain"
            className="input"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          {fileError && <p className="error">{fileError}</p>}
          {previewBlob && (
            <FilePreview
              blob={previewBlob.blob}
              type={previewBlob.type}
              name={previewBlob.name}
            />
          )}
          {!existing?.fileId && (
            <div className="button-row">
              <Button
                onClick={() =>
                  setForm({
                    ...form,
                    status:
                      form.status === "saved_externally"
                        ? "pending"
                        : "saved_externally",
                  })
                }
              >
                {form.status === "saved_externally"
                  ? "取消“已自行保存”"
                  : "标记为已自行保存"}
              </Button>
              {form.status === "saved_externally" && (
                <span className="muted self-center">原文件未上传</span>
              )}
            </div>
          )}
          {file && (
            <div className="button-row">
              <Button variant="primary" disabled={busy} onClick={extract}>
                {busy ? "正在提取…" : "模拟 AI 提取"}
              </Button>
            </div>
          )}
        </div>
        {draft && (
          <div className="card stack">
            <SectionTitle
              title="模拟提取结果"
              action={<MockBadge label="模拟提取" />}
            />
            <label className="label" htmlFor="draft">
              摘要（可修改）
            </label>
            <textarea
              id="draft"
              className="input min-h-32"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <p className="small muted">
              标签为“待确认”。演示不会读取图片或 PDF
              中的人物与事实，请对照原文件核对。
            </p>
            <div className="button-row">
              <Button
                variant="primary"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    extractionStatus: "confirmed",
                    extractionDraft: draft,
                    confirmedExtraction: draft,
                  }))
                }
              >
                确认摘要
              </Button>
              <Button
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    extractionStatus: "draft",
                    confirmedExtraction: undefined,
                  }))
                }
              >
                保持待确认
              </Button>
            </div>
            {form.extractionStatus === "confirmed" && (
              <p className="success">摘要已确认，会作为你核对过的内容保存。</p>
            )}
          </div>
        )}
        <div className="button-row">
          <Button
            variant="primary"
            disabled={busy || !form.name.trim()}
            onClick={submit}
          >
            {busy ? "正在保存…" : "保存材料"}
          </Button>
          <Button onClick={() => navigate(-1)}>取消</Button>
        </div>
        {busy && <LoadingState label="正在保存材料" />}
      </div>
    </RequireProfile>
  );
}
export function MaterialDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const material = useAppStore((s) => s.materials).find((m) => m.id === id);
  const events = useAppStore((s) => s.events);
  const [stored, setStored] = useState<
    { blob: Blob; name: string; type: string } | undefined
  >();
  const [error, setError] = useState("");
  useEffect(() => {
    if (material?.fileId)
      fileService
        .get(material.fileId)
        .then(setStored)
        .catch((e) => setError(e.message));
  }, [material?.fileId]);
  if (!material)
    return (
      <div className="page">
        <EmptyState
          title="没有找到这份材料"
          description="它可能已经被删除。"
          action={
            <Button variant="primary" to="/review?tab=materials">
              回到材料库
            </Button>
          }
        />
      </div>
    );
  const linked = events.filter((e) => material.eventIds.includes(e.id));
  return (
    <RequireProfile>
      <div className="page stack">
        <PageHeader
          title={material.name}
          subtitle={MATERIAL_TYPES[material.type]}
          back="/review?tab=materials"
        />
        <div className="card stack">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={material.status === "uploaded" ? "success" : "neutral"}
            >
              {MATERIAL_STATUS[material.status]}
            </Badge>
            {material.status === "saved_externally" && (
              <Badge tone="warning">原文件未上传</Badge>
            )}
            {material.isCurrent && <Badge tone="success">当前有效</Badge>}
            {material.extractionStatus === "draft" && (
              <Badge tone="warning">摘要待确认</Badge>
            )}
            {material.extractionStatus === "confirmed" && (
              <Badge tone="success">摘要已确认</Badge>
            )}
          </div>
          <dl className="grid-2 text-sm">
            <div>
              <dt className="muted">覆盖范围</dt>
              <dd>
                {material.coverageStart
                  ? `${fullDate(material.coverageStart)} 至 ${material.coverageEnd ? fullDate(material.coverageEnd) : "至今"}`
                  : "未填写"}
              </dd>
            </div>
            <div>
              <dt className="muted">原始文件</dt>
              <dd>
                {material.fileName || "未上传"}
                {material.fileSize
                  ? `（${Math.round(material.fileSize / 1024)} KB）`
                  : ""}
              </dd>
            </div>
          </dl>
          {material.externalLocationNote && (
            <p className="small muted">
              保存位置：{material.externalLocationNote}
            </p>
          )}
          {material.note && (
            <p className="small muted">备注：{material.note}</p>
          )}
          <div className="button-row">
            <Button to={`/materials/upload?edit=${material.id}`}>
              更新材料信息
            </Button>
            {stored && (
              <Button onClick={() => downloadBlob(stored.blob, stored.name)}>
                <Download size={16} />
                下载原始文件
              </Button>
            )}
          </div>
        </div>
        {stored ? (
          <div className="card stack">
            <SectionTitle title="原始文件预览" />
            <FilePreview
              blob={stored.blob}
              type={stored.type}
              name={stored.name}
            />
            <p className="small muted">
              <ShieldCheck size={14} /> 原始文件不会被修改或覆盖。
            </p>
          </div>
        ) : (
          <div className="card">
            <p className="muted">这份材料没有上传原文件，仅记录了保存状态。</p>
          </div>
        )}
        <div className="card stack">
          <SectionTitle
            title="摘要"
            action={
              material.extractionStatus === "draft" ? (
                <MockBadge label="模拟提取" />
              ) : undefined
            }
          />
          {material.confirmedExtraction ? (
            <>
              <p className="text-sm whitespace-pre-line">
                {material.confirmedExtraction}
              </p>
              <p className="small muted">这是你确认过的摘要。</p>
            </>
          ) : material.extractionDraft ? (
            <>
              <p className="text-sm whitespace-pre-line">
                {material.extractionDraft}
              </p>
              <p className="small muted">
                这是模拟提取的草稿，尚未确认，不会作为事实进入报告。
              </p>
              <Button
                variant="primary"
                to={`/materials/upload?edit=${material.id}`}
              >
                核对并确认摘要
              </Button>
            </>
          ) : (
            <p className="muted">
              还没有摘要。可以手动补充，或上传文件后使用模拟提取。
            </p>
          )}
        </div>
        {linked.length > 0 && (
          <div className="card stack">
            <SectionTitle title="关联事件" />
            {linked.map((event) => (
              <Button key={event.id} to={`/events/${event.id}`}>
                {event.title}
              </Button>
            ))}
          </div>
        )}
        <div className="button-row">
          <Button onClick={() => navigate(-1)}>返回</Button>
        </div>
      </div>
    </RequireProfile>
  );
}
