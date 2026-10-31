import { supabase } from './supabase'

// Every event thumbnail is stored at the same size and shape (16:9, 1200 × 675 JPEG),
// so cards line up no matter what photo was chosen.
export const THUMB_W = 1200
export const THUMB_H = 675
export const MAX_IMAGE_MB = 15

// Centre-crops the chosen picture to 16:9 and scales it down. Resolves to a JPEG Blob.
export function prepareEventImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { reject(new Error('Please choose an image file')); return }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) { reject(new Error(`That image is too big — the limit is ${MAX_IMAGE_MB} MB`)); return }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const target = THUMB_W / THUMB_H
      let sw = img.width, sh = img.height
      if (sw / sh > target) sw = Math.round(sh * target)      // too wide: trim the sides
      else sh = Math.round(sw / target)                       // too tall: trim top and bottom
      const sx = Math.round((img.width - sw) / 2)
      const sy = Math.round((img.height - sh) / 2)
      const canvas = document.createElement('canvas')
      canvas.width = THUMB_W; canvas.height = THUMB_H
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, THUMB_W, THUMB_H)   // flattens transparent PNGs
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, THUMB_W, THUMB_H)
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('Could not process that image'))),
        'image/jpeg', 0.82
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file couldn't be read as an image")) }
    img.src = url
  })
}

// Uploads into event-images/<group id>/<random>.jpg and returns the public URL
export async function uploadEventImage(groupId, blob) {
  const name = `${groupId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('event-images').upload(name, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error) throw error
  return supabase.storage.from('event-images').getPublicUrl(name).data.publicUrl
}
