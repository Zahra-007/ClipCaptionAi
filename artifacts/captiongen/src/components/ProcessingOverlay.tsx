import { motion } from 'framer-motion'
import { Sparkles, AudioLines, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'

export function ProcessingOverlay() {
  const [step, setStep] = useState(0)

  const steps = [
    { icon: AudioLines, text: "Extracting audio track..." },
    { icon: Sparkles, text: "Transcribing with AI Whisper..." },
    { icon: FileText, text: "Burning captions into video..." },
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev))
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="w-full max-w-md mx-auto py-12 flex flex-col items-center justify-center text-center">
      <div className="relative w-24 h-24 mb-8 flex items-center justify-center">
        {/* Pulsing rings */}
        <motion.div
          animate={{ scale: [1, 1.5, 2], opacity: [0.5, 0.2, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          className="absolute inset-0 rounded-full bg-primary/20"
        />
        <motion.div
          animate={{ scale: [1, 1.5], opacity: [0.8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
          className="absolute inset-2 rounded-full bg-primary/40"
        />
        <div className="relative z-10 w-16 h-16 bg-gradient-to-tr from-primary to-blue-400 rounded-full shadow-xl shadow-primary/30 flex items-center justify-center text-white">
          <Sparkles className="w-8 h-8 animate-pulse" />
        </div>
      </div>

      <h3 className="text-xl font-bold text-foreground font-display mb-2">
        Generating Captions
      </h3>
      <p className="text-sm text-muted-foreground mb-8 max-w-[280px]">
        This usually takes a minute or two depending on your video length.
      </p>

      <div className="w-full space-y-3">
        {steps.map((s, i) => {
          const Icon = s.icon
          const isActive = i === step
          const isPast = i < step

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: isActive || isPast ? 1 : 0.4, x: 0 }}
              className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 shadow-sm"
            >
              <div className={`p-2 rounded-lg ${isActive ? 'bg-primary/10 text-primary' : isPast ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                <Icon className={`w-4 h-4 ${isActive ? 'animate-pulse' : ''}`} />
              </div>
              <span className={`text-sm font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                {s.text}
              </span>
              {isPast && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="ml-auto w-2 h-2 rounded-full bg-green-500" />
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
