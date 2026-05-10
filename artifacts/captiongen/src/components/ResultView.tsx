import { ProcessResult } from '@workspace/api-client-react/src/generated/api.schemas'
import { Download, FileDown, Play, CheckCircle2, AlertCircle } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { motion } from 'framer-motion'

interface ResultViewProps {
  result: ProcessResult
  onReset: () => void
  burnError?: string | null
}

export function ResultView({ result, onReset, burnError }: ResultViewProps) {
  const hasVideo = !!result.captionedVideoUrl

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-6xl mx-auto space-y-8"
    >
      {/* Banner: full success or partial (burn failed) */}
      {hasVideo ? (
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-green-500/10 border border-green-500/20 p-4 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="bg-green-500 rounded-full p-1 text-white">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-green-900 dark:text-green-400">Captions generated successfully!</h3>
              <p className="text-sm text-green-700 dark:text-green-500/80">Your video is ready to download.</p>
            </div>
          </div>
          <button
            onClick={onReset}
            className="text-sm font-medium px-4 py-2 bg-background border border-border rounded-lg shadow-sm hover:bg-muted transition-colors"
          >
            Process Another Video
          </button>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-500 rounded-full p-1 text-white">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-yellow-900 dark:text-yellow-400">Transcript ready — video burn failed</h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-500/80">
                {burnError ? burnError.slice(0, 120) : "Caption burn step failed. You can still download the .SRT file and transcript below."}
              </p>
            </div>
          </div>
          <button
            onClick={onReset}
            className="text-sm font-medium px-4 py-2 bg-background border border-border rounded-lg shadow-sm hover:bg-muted transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Video Preview Column */}
        <div className="lg:col-span-3 space-y-6">
          <div className="rounded-2xl overflow-hidden border border-border/50 shadow-xl shadow-black/5 bg-black aspect-video relative group">
            {result.captionedVideoUrl ? (
              <video 
                src={result.captionedVideoUrl} 
                controls 
                className="w-full h-full object-contain"
                poster="" // Could add a generated poster here if available
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground flex-col gap-2">
                <AlertCircle className="w-8 h-8" />
                <p>Preview unavailable</p>
              </div>
            )}
          </div>

          <div className={`grid gap-4 ${hasVideo ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
            {hasVideo && (
              <a 
                href={result.captionedVideoUrl!}
                download={result.captionedVideoFilename || "captioned_video.mp4"}
                className="flex items-center justify-center gap-2 w-full px-6 py-4 rounded-xl font-semibold bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
              >
                <Download className="w-5 h-5" />
                Download Video
              </a>
            )}
            
            <a 
              href={result.srtUrl}
              download={result.srtFilename || "captions.srt"}
              className="flex items-center justify-center gap-2 w-full px-6 py-4 rounded-xl font-semibold bg-card border-2 border-border text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all duration-200 shadow-sm"
            >
              <FileDown className="w-5 h-5" />
              Download .SRT Subtitles
            </a>
          </div>
        </div>

        {/* Transcript Column */}
        <div className="lg:col-span-2 flex flex-col bg-card rounded-3xl border border-border/50 shadow-xl shadow-black/5 overflow-hidden">
          <div className="p-5 border-b border-border/50 bg-muted/30">
            <h3 className="font-display font-semibold text-lg flex items-center gap-2">
              <AudioLines className="w-5 h-5 text-primary" />
              Transcript
            </h3>
          </div>
          
          <div className="flex-1 p-5 overflow-y-auto max-h-[500px] custom-scrollbar space-y-4">
            {result.segments && result.segments.length > 0 ? (
              result.segments.map((seg, idx) => (
                <div key={idx} className="flex gap-4 group">
                  <div className="text-xs font-mono font-medium text-muted-foreground pt-1 shrink-0 w-12 opacity-60 group-hover:opacity-100 transition-opacity">
                    {formatTime(seg.start)}
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90 group-hover:text-foreground transition-colors">
                    {seg.text}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic p-4 text-center">
                No speech detected in this video.
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function AudioLines(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 10v3" />
      <path d="M6 6v11" />
      <path d="M10 3v18" />
      <path d="M14 8v7" />
      <path d="M18 5v13" />
      <path d="M22 10v3" />
    </svg>
  )
}
