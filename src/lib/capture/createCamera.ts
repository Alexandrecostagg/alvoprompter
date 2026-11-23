import { Capacitor } from '@capacitor/core'
import { CaptureController } from './CaptureController'
import { IosCameraPort } from './IosCameraPort'
import { WebCameraPort } from './WebCameraPort'

export function createCamera() {
  return new CaptureController(Capacitor.getPlatform() === 'ios' ? new IosCameraPort() : new WebCameraPort())
}
