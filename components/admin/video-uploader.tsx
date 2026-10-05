'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { startUpload } from '@/app/actions/admin-videos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Stage = 'idle' | 'preparing' | 'uploading' | 'done' | 'error';

/**
 * Drag-and-drop upload straight to Mux.
 *
 * `XMLHttpRequest` rather than `fetch`, for one reason: fetch has no upload
 * progress event. Kelly is uploading a 45-minute video over rural broadband or a
 * phone connection, and a button that says nothing for eleven minutes is a button
 * she will press again.
 */
export function VideoUploader() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('idle');
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    const title = titleRef.current?.value?.trim();
    if (!title) {
      setError('Give it a title first — you can change it later.');
      return;
    }

    setError(null);
    setStage('preparing');
    setPercent(0);

    const form = new FormData();
    form.set('title', title);
    const started = await startUpload(form);

    if (!started.ok) {
      setError(started.error);
      setStage('error');
      return;
    }
    if (!('uploadUrl' in started)) {
      setError('Something went wrong starting the upload.');
      setStage('error');
      return;
    }

    setStage('uploading');

    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', started.uploadUrl);

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          setPercent(Math.round((event.loaded / event.total) * 100));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setStage('done');
          // Mux still has to transcode, which is why this says "processing"
          // rather than "done" in the list. Refreshing shows the new row.
          router.refresh();
        } else {
          setError(`Mux rejected the upload (${xhr.status}).`);
          setStage('error');
        }
        resolve();
      });

      xhr.addEventListener('error', () => {
        setError('The upload failed — check the connection and try again.');
        setStage('error');
        resolve();
      });

      xhr.send(file);
    });
  }

  const busy = stage === 'preparing' || stage === 'uploading';

  return (
    <div className="border-subtle bg-surface rounded-xl border p-5">
      <h2 className="text-[length:var(--text-lg)]">Add a video</h2>

      <div className="mt-4">
        <Label htmlFor="video-title">Title</Label>
        <Input
          id="video-title"
          ref={titleRef}
          placeholder="Express Arms"
          disabled={busy}
          className="mt-1"
        />
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        className={[
          'mt-4 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          dragging ? 'border-strong bg-accent-soft' : 'border-subtle',
        ].join(' ')}
      >
        {stage === 'uploading' ? (
          <>
            <p className="text-primary font-medium">Uploading… {percent}%</p>
            <div className="bg-surface-sunk mx-auto mt-3 h-2 max-w-sm overflow-hidden rounded-full">
              <div
                className="bg-accent h-full transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-muted mt-2 text-xs">Keep this page open until it reaches 100%.</p>
          </>
        ) : stage === 'preparing' ? (
          <p className="text-primary font-medium">Getting ready…</p>
        ) : stage === 'done' ? (
          <>
            <p className="text-primary font-medium">Uploaded</p>
            <p className="text-muted mt-1 text-sm">
              Mux is processing it now. It will show as <strong>Ready</strong> in the list below in
              a few minutes — then add the details and publish.
            </p>
          </>
        ) : (
          <>
            <p className="text-primary font-medium">Drop a video file here</p>
            <p className="text-muted mt-1 text-sm">or</p>
            <div className="mt-3">
              <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
                Choose a file
              </Button>
            </div>
            <p className="text-muted mt-3 text-xs">
              Goes straight to Mux, so a long class from your phone is fine.
            </p>
          </>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="text-status-full-fg mt-3 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
