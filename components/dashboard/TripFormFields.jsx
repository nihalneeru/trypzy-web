'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/**
 * Reusable trip form fields (name, destination, circle name, type, duration, dates, description).
 * Used by CreateTripDialog, CircleOnboardingInterstitial, and TripFirstFlow.
 *
 * @param {Object} props
 * @param {{ name: string, description: string, type: string, startDate: string, endDate: string, duration: string, destinationHint: string, circleName?: string, circleNameDirty?: boolean }} props.tripForm
 * @param {(form: Object) => void} props.onChange
 * @param {boolean} [props.showCircleName=false] - Show circle name field (trip-first flow only)
 */
export function TripFormFields({ tripForm, onChange, showCircleName = false }) {
  const update = (field, value) => onChange({ ...tripForm, [field]: value })

  const handleNameChange = (newName) => {
    const updates = { ...tripForm, name: newName }
    if (showCircleName && !tripForm.circleNameDirty) {
      updates.circleName = newName ? `${newName} circle` : ''
    }
    onChange(updates)
  }

  return (
    <>
      <div className="space-y-2">
        <Label>Trip Name</Label>
        <Input
          value={tripForm.name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Summer Beach Trip"
        />
      </div>
      <div className="space-y-2">
        <Label>
          Destination
          <span className="text-xs font-normal text-gray-500 ml-1">(optional)</span>
        </Label>
        <Input
          value={tripForm.destinationHint || ''}
          onChange={(e) => update('destinationHint', e.target.value)}
          placeholder="e.g., Miami, Tulum, Lake Tahoe"
        />
      </div>
      {showCircleName && (
        <div className="space-y-2">
          <Label>
            Circle name
            <span className="text-xs font-normal text-gray-500 ml-1">(optional)</span>
          </Label>
          <p className="text-xs text-gray-500">
            A circle is your group of travelers. Defaults to your trip name.
          </p>
          <Input
            value={tripForm.circleName || ''}
            onChange={(e) => {
              onChange({ ...tripForm, circleName: e.target.value, circleNameDirty: true })
            }}
            placeholder="e.g., Beach Crew"
            maxLength={100}
          />
        </div>
      )}
      <div className="space-y-2">
        <Label>Trip Type</Label>
        <Select
          value={tripForm.type}
          onValueChange={(v) => update('type', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="collaborative">Collaborative (everyone votes on dates)</SelectItem>
            <SelectItem value="hosted">Hosted (fixed dates, join if available)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500 mt-1">
          {tripForm.type === 'collaborative'
            ? "Your group suggests and votes on dates together. Best for flexible planning."
            : "You set the dates, others join if they can. Best when dates are already decided."}
        </p>
      </div>
      {tripForm.type === 'collaborative' && (
        <div className="space-y-2">
          <Label>
            How long would you like this trip to be?
            <span className="text-xs font-normal text-gray-500 ml-1">(optional)</span>
          </Label>
          <p className="text-xs text-gray-500">
            Just a starting point—your group can adjust this later.
          </p>
          <Select
            value={tripForm.duration || 'none'}
            onValueChange={(v) => update('duration', v === 'none' ? '' : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="No preference" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No preference</SelectItem>
              <SelectItem value="weekend">Weekend (2–3 days)</SelectItem>
              <SelectItem value="extended-weekend">Extended weekend (3–4 days)</SelectItem>
              <SelectItem value="few-days">A few days (4–5 days)</SelectItem>
              <SelectItem value="week">A week</SelectItem>
              <SelectItem value="week-plus">Week+ (8+ days)</SelectItem>
              <SelectItem value="flexible">Flexible</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label>
          {tripForm.type === 'hosted' ? 'Trip Dates' : 'Planning Window'}
          {tripForm.type === 'collaborative' && (
            <span className="text-xs font-normal text-gray-500 ml-1">(optional)</span>
          )}
        </Label>
        <p className="text-xs text-gray-500">
          {tripForm.type === 'hosted'
            ? 'Set the fixed dates for your trip. Participants join if they can make it.'
            : 'Optionally set a date range. Your group can suggest windows and finalize dates later.'}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{tripForm.type === 'hosted' ? 'Start date' : 'Earliest possible date'}</Label>
            <Input
              type="date"
              value={tripForm.startDate}
              onChange={(e) => update('startDate', e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              required={tripForm.type === 'hosted'}
            />
          </div>
          <div className="space-y-2">
            <Label>{tripForm.type === 'hosted' ? 'End date' : 'Latest possible date'}</Label>
            <Input
              type="date"
              value={tripForm.endDate}
              onChange={(e) => update('endDate', e.target.value)}
              min={tripForm.startDate || new Date().toISOString().split('T')[0]}
              required={tripForm.type === 'hosted'}
            />
          </div>
        </div>
      </div>
      <details className="group">
        <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700 select-none">
          Add a description (optional)
        </summary>
        <div className="space-y-2 pt-2">
          <Textarea
            value={tripForm.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="A relaxing weekend getaway..."
            rows={2}
          />
        </div>
      </details>
    </>
  )
}
