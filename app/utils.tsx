export function generatePollIdBasedOnInterval(date = new Date()): string {
  const minutes = date.getMinutes();
  const roundedMinutes = minutes - (minutes % 10); // Round down to the nearest 10
  date.setMinutes(roundedMinutes, 0, 0); // Reset seconds and milliseconds to 0

  // Generate a string that represents this interval, e.g., '20220207T0410'
  const pollId = date.toISOString().replace(/:\d{2}\.\d{3}Z$/, '').replace(/[-:]/g, '').replace('T', 'T').substring(0, 13) + '0';
  return pollId;
}