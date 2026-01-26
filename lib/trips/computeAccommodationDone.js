/**
 * Compute whether accommodation is "done" for a trip
 * Accommodation is done when all active stay requirements have selected accommodations
 * 
 * @param {Object} db - MongoDB database instance
 * @param {string} tripId - Trip ID
 * @returns {Promise<boolean>} True if all stays have selected accommodations
 */
export async function computeAccommodationDone(db, tripId) {
  // Get all active stay requirements for this trip
  const stays = await db.collection('stay_requirements')
    .find({
      tripId,
      status: { $in: ['pending', 'covered'] } // Active stays only
    })
    .toArray()

  if (stays.length === 0) {
    // No stay requirements — check if any accommodation option is selected directly
    // This covers the simplified model where options are added without stay requirements
    const selectedOption = await db.collection('accommodation_options')
      .findOne({ tripId, status: 'selected' })
    return !!selectedOption
  }

  // Check if each stay has a selected accommodation
  for (const stay of stays) {
    const selectedAccommodation = await db.collection('accommodation_options')
      .findOne({
        tripId,
        stayRequirementId: stay.id,
        status: 'selected'
      })

    if (!selectedAccommodation) {
      return false
    }
  }

  return true
}
