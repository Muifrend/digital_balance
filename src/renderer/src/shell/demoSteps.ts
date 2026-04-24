import type { DemoStep } from './DemoOverlay'

export const demoSteps: DemoStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Canopy',
    body:
      'Canopy helps you compare the work you planned with the activity your computer actually captured so you can see how your day really unfolded.',
    preferredPlacement: 'center'
  },
  {
    id: 'calendar',
    title: 'Plan vs. reality',
    body:
      'The calendar is split in two: planned work on the left, captured activity on the right. Create or drag blocks on the left, then click activity on the right to inspect what happened.',
    section: 'calendar',
    anchor: 'calendar-overview',
    preferredPlacement: 'bottom'
  },
  {
    id: 'projects',
    title: 'Give the app context',
    body:
      'Projects tell Canopy what your work actually is. Adding a clear project makes it easier for AI classification to recognize whether your activity matched your intent.',
    section: 'projects',
    anchor: 'projects-new-project',
    preferredPlacement: 'left'
  },
  {
    id: 'analytics',
    title: 'Review the day',
    body:
      'Analytics shows how your time broke down once activity starts accumulating, so you can spot patterns in on-task and off-task work over the day and week.',
    section: 'analytics',
    anchor: 'analytics-header',
    preferredPlacement: 'bottom'
  },
  {
    id: 'settings',
    title: 'Turn on AI features',
    body:
      'Add your OpenAI API key in Settings to enable AI-powered classification and feedback features. You can update or remove the key later at any time.',
    section: 'settings',
    anchor: 'settings-api-key',
    preferredPlacement: 'bottom'
  }
]
