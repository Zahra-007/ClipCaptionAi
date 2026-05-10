import { Link } from "wouter"
import { AlertCircle } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center space-y-6 max-w-md p-8 bg-card rounded-3xl shadow-xl border border-border">
        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto text-muted-foreground">
          <AlertCircle className="w-10 h-10" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">404</h1>
          <p className="text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        <Link 
          href="/" 
          className="inline-block w-full px-6 py-3 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Return Home
        </Link>
      </div>
    </div>
  )
}
