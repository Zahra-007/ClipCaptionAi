import React, { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { UploadCloud, FileVideo, X, Film } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface UploadZoneProps {
  file: File | null
  setFile: (file: File | null) => void
  disabled?: boolean
}

export function UploadZone({ file, setFile, disabled = false }: UploadZoneProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles?.length > 0) {
      setFile(acceptedFiles[0])
    }
  }, [setFile])

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'video/mp4': ['.mp4'],
      'video/quicktime': ['.mov'],
      'video/x-msvideo': ['.avi'],
      'video/webm': ['.webm']
    },
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024, // 100MB
    disabled
  })

  const removeFile = (e: React.MouseEvent) => {
    e.stopPropagation()
    setFile(null)
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      <div
        {...getRootProps()}
        className={cn(
          "relative overflow-hidden group rounded-3xl border-2 border-dashed transition-all duration-300 ease-out bg-card",
          isDragActive ? "border-primary bg-primary/5 scale-[1.02]" : "border-border hover:border-primary/50 hover:bg-muted/50",
          isDragReject ? "border-destructive bg-destructive/5" : "",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          file ? "border-primary/30 bg-primary/5" : "p-12"
        )}
      >
        <input {...getInputProps()} />

        <AnimatePresence mode="wait">
          {!file ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center justify-center text-center space-y-4"
            >
              <div className={cn(
                "p-4 rounded-2xl transition-colors duration-300",
                isDragActive ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
              )}>
                <UploadCloud className="w-10 h-10" strokeWidth={1.5} />
              </div>
              
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {isDragActive ? "Drop your video here" : "Click or drag video to upload"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  MP4, MOV, AVI, WEBM up to 100MB
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground/80 mt-4">
                <span className="flex items-center gap-1.5"><Film className="w-3.5 h-3.5" /> Max 60 seconds</span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="filled"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-6 flex items-center justify-between"
            >
              <div className="flex items-center space-x-4 overflow-hidden">
                <div className="bg-primary/10 p-3 rounded-xl shrink-0">
                  <FileVideo className="w-8 h-8 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate pr-4">
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>
              
              {!disabled && (
                <button
                  onClick={removeFile}
                  className="shrink-0 p-2 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors focus:outline-none focus:ring-2 focus:ring-destructive/20"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
