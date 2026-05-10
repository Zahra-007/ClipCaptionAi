import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UploadZone } from '@/components/UploadZone'
import { ProcessingOverlay } from '@/components/ProcessingOverlay'
import { ResultView } from '@/components/ResultView'
import { useProcessVideo } from '@workspace/api-client-react'
import { AlertCircle, Wand2 } from 'lucide-react'

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const processMutation = useProcessVideo()

  const handleGenerate = () => {
    if (!file) return
    setError(null)
    
    // Check file size (100MB)
    if (file.size > 100 * 1024 * 1024) {
      setError("File is too large. Maximum size is 100MB.")
      return
    }

    processMutation.mutate(
      { data: { video: file } },
      {
        onError: (err: any) => {
          // Attempt to extract meaningful error message from backend
          const msg = err?.response?.data?.error || err.message || "An unexpected error occurred while processing the video."
          setError(msg)
        }
      }
    )
  }

  const handleReset = () => {
    setFile(null)
    setError(null)
    processMutation.reset()
  }

  const isIdle = processMutation.isIdle && !processMutation.isSuccess
  const isProcessing = processMutation.isPending
  // Full success: video + transcript ready
  const isSuccess = processMutation.isSuccess && processMutation.data?.success === true
  // Partial success: burn failed but transcript/SRT exist — show ResultView with a warning
  const isPartial = processMutation.isSuccess && !processMutation.data?.success && !!processMutation.data?.transcript
  // Hard failure: no transcript at all
  const hasResultError = processMutation.isSuccess && !processMutation.data?.success && !processMutation.data?.transcript

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-background">
      {/* Background decoration */}
      <div className="absolute inset-0 z-0 opacity-40 pointer-events-none select-none flex items-center justify-center">
         <img 
            src={`${import.meta.env.BASE_URL}images/bg-mesh.png`}
            alt="" 
            className="w-full h-full object-cover min-h-screen mix-blend-multiply opacity-50"
         />
      </div>

      {/* Main Content */}
      <main className="relative z-10 container mx-auto px-4 py-12 md:py-24 min-h-screen flex flex-col">
        
        {/* Header - Always visible unless in success state (to save space) */}
        <AnimatePresence>
          {!isSuccess && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
              className="text-center max-w-3xl mx-auto mb-12"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
                <SparklesIcon className="w-4 h-4" />
                <span>AI-Powered Transcription</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-foreground mb-6 leading-tight">
                Add Captions to Your <br className="hidden sm:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">
                  Videos in Seconds
                </span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground">
                Upload your video and our advanced AI will instantly transcribe the speech and burn beautiful subtitles into it.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 flex flex-col items-center justify-center w-full">
          <AnimatePresence mode="wait">
            
            {/* STATE: Idle / File Selection */}
            {isIdle && !hasResultError && (
              <motion.div 
                key="upload"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-xl flex flex-col gap-6"
              >
                <UploadZone file={file} setFile={setFile} disabled={isProcessing} />
                
                {error && (
                  <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl flex items-start gap-3 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <p>{error}</p>
                  </div>
                )}

                <button
                  onClick={handleGenerate}
                  disabled={!file || isProcessing}
                  className="w-full flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-primary to-blue-500 text-white shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/40 hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none disabled:transform-none transition-all duration-300"
                >
                  <Wand2 className="w-6 h-6" />
                  Generate Captions
                </button>
              </motion.div>
            )}

            {/* STATE: Processing */}
            {isProcessing && (
              <motion.div 
                key="processing"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="w-full"
              >
                <ProcessingOverlay />
              </motion.div>
            )}

            {/* STATE: Success (full or partial) */}
            {(isSuccess || isPartial) && processMutation.data && (
              <motion.div 
                key="result"
                className="w-full"
              >
                <ResultView
                  result={processMutation.data}
                  onReset={handleReset}
                  burnError={isPartial ? (processMutation.data.error ?? null) : null}
                />
              </motion.div>
            )}

            {/* STATE: Result Error (API 200 but success: false) */}
            {hasResultError && (
              <motion.div 
                key="result-error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full max-w-md mx-auto text-center space-y-6"
              >
                <div className="w-20 h-20 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">Processing Failed</h3>
                <p className="text-muted-foreground">
                  {processMutation.data?.error || "We couldn't generate captions for this video. Please try another one."}
                </p>
                <button
                  onClick={handleReset}
                  className="px-6 py-3 bg-card border-2 border-border rounded-xl font-medium hover:bg-muted transition-colors"
                >
                  Try Again
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}

function SparklesIcon(props: any) {
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
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  )
}
