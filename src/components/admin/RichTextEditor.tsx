"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { supabase } from "@/lib/supabase";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Code2,
  Loader2,
  Undo,
  Redo,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "İçeriği buraya yazın...",
  minHeight = 300,
}: RichTextEditorProps) {
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceValue, setSourceValue] = useState(value);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ allowBase64: false, inline: false }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-olive-600 underline" } }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none px-4 py-3",
        style: `min-height: ${minHeight}px`,
      },
    },
    immediatelyRender: false,
  });

  // Dışarıdan value değişirse editörü güncelle (edit mode açılınca)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value || "");
      setSourceValue(value || "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Source → Visual geçişinde editörü güncelle
  function handleSourceBlur() {
    if (editor) {
      editor.commands.setContent(sourceValue);
      onChange(sourceValue);
    }
  }

  // Görsel yükleme
  const handleImageUpload = useCallback(async (file: File) => {
    if (!editor) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `kb/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("site")
        .upload(fileName, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("site").getPublicUrl(fileName);
      editor.chain().focus().setImage({ src: urlData.publicUrl }).run();
    } catch (err) {
      console.error("Görsel yüklenemedi:", err);
      alert("Görsel yüklenirken bir hata oluştu.");
    } finally {
      setUploading(false);
    }
  }, [editor]);

  // Link ekleme
  function handleLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href || "";
    const url = window.prompt("Link URL:", prev);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }

  if (!editor) return null;

  const ToolbarButton = ({
    onClick,
    active,
    title,
    children,
    disabled,
  }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`p-1.5 rounded text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? "bg-slate-200 text-slate-900" : ""
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 bg-slate-50 border-b border-slate-200">
        <ToolbarButton
          title="Geri Al"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="İleri Al"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo size={15} />
        </ToolbarButton>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        <ToolbarButton
          title="Kalın"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="İtalik"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={15} />
        </ToolbarButton>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        <ToolbarButton
          title="Başlık 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Başlık 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={15} />
        </ToolbarButton>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        <ToolbarButton
          title="Madde Listesi"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton
          title="Numaralı Liste"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={15} />
        </ToolbarButton>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        <ToolbarButton title="Link Ekle" active={editor.isActive("link")} onClick={handleLink}>
          <LinkIcon size={15} />
        </ToolbarButton>

        {/* Görsel Yükleme */}
        <ToolbarButton
          title="Görsel Ekle"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}
        </ToolbarButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageUpload(file);
            e.target.value = "";
          }}
        />

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* HTML Kaynak Modu */}
        <button
          type="button"
          title="HTML Kaynak"
          onClick={() => {
            if (!sourceMode) {
              setSourceValue(editor.getHTML());
            } else {
              handleSourceBlur();
            }
            setSourceMode(!sourceMode);
          }}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
            sourceMode
              ? "bg-olive-600 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Code2 size={14} /> HTML
        </button>
      </div>

      {/* Editör alanı */}
      {sourceMode ? (
        <textarea
          className="w-full font-mono text-xs text-slate-800 bg-slate-950 text-green-400 px-4 py-3 focus:outline-none resize-y"
          style={{ minHeight: `${minHeight}px` }}
          value={sourceValue}
          onChange={(e) => {
            setSourceValue(e.target.value);
            onChange(e.target.value);
          }}
          onBlur={handleSourceBlur}
          spellCheck={false}
        />
      ) : (
        <div className="bg-white">
          <EditorContent editor={editor} />
        </div>
      )}

      {/* Prose stilleri inline */}
      <style>{`
        .tiptap p { margin: 0.5em 0; }
        .tiptap h1 { font-size: 1.5rem; font-weight: 700; margin: 0.75em 0 0.25em; }
        .tiptap h2 { font-size: 1.25rem; font-weight: 600; margin: 0.75em 0 0.25em; }
        .tiptap ul { list-style: disc; padding-left: 1.5em; margin: 0.5em 0; }
        .tiptap ol { list-style: decimal; padding-left: 1.5em; margin: 0.5em 0; }
        .tiptap a { color: #536430; text-decoration: underline; }
        .tiptap img { max-width: 100%; border-radius: 0.5rem; margin: 0.75em 0; }
        .tiptap strong { font-weight: 700; }
        .tiptap em { font-style: italic; }
        .tiptap p.is-editor-empty:first-child::before {
          color: #adb5bd;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
