package expo.modules.vlcplayer.cast

import android.graphics.SurfaceTexture
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLExt
import android.opengl.EGLSurface
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.view.Surface
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * Sits between the decoder and the encoder so frames can be resized on the way through: the decoder draws into this
 * scaler's surface, and each frame is redrawn into the encoder's surface at the size the encoder wants.
 *
 * Converting a 1080p film at 720p is what makes the phone fast enough to stay comfortably ahead of playback.
 * All calls belong to one thread, the converter's worker.
 */
internal class GlScaler(encoderSurface: Surface, private val width: Int, private val height: Int) {
  private var display: EGLDisplay = EGL14.EGL_NO_DISPLAY
  private var context: EGLContext = EGL14.EGL_NO_CONTEXT
  private var eglSurface: EGLSurface = EGL14.EGL_NO_SURFACE
  private var program = 0
  private var textureId = 0
  private var positionHandle = 0
  private var textureHandle = 0
  private var matrixHandle = 0
  private val transform = FloatArray(16)
  private val vertices: FloatBuffer = ByteBuffer.allocateDirect(VERTICES.size * 4)
    .order(ByteOrder.nativeOrder())
    .asFloatBuffer()
    .apply {
      put(VERTICES)
      position(0)
    }

  private val frameLock = Object()
  private var frameAvailable = false

  private val surfaceTexture: SurfaceTexture

  /** Where the decoder renders its frames. */
  val inputSurface: Surface

  init {
    setUpEgl(encoderSurface)
    program = buildProgram()
    textureId = createTexture()
    surfaceTexture = SurfaceTexture(textureId).apply {
      setDefaultBufferSize(width, height)
      setOnFrameAvailableListener {
        synchronized(frameLock) {
          frameAvailable = true
          frameLock.notifyAll()
        }
      }
    }
    inputSurface = Surface(surfaceTexture)
  }

  /**
   * Waits for the frame the decoder just released, draws it at the encoder's size and hands it over with [ptsUs].
   * False when no frame arrived in time, which the caller can ignore.
   */
  fun drawFrame(ptsUs: Long): Boolean {
    if (!awaitFrame()) return false
    surfaceTexture.updateTexImage()
    surfaceTexture.getTransformMatrix(transform)

    GLES20.glViewport(0, 0, width, height)
    GLES20.glClearColor(0f, 0f, 0f, 1f)
    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
    GLES20.glUseProgram(program)
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
    GLES20.glUniform1i(textureHandle, 0)
    GLES20.glUniformMatrix4fv(matrixHandle, 1, false, transform, 0)

    vertices.position(0)
    GLES20.glVertexAttribPointer(positionHandle, 2, GLES20.GL_FLOAT, false, STRIDE, vertices)
    GLES20.glEnableVertexAttribArray(positionHandle)
    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    GLES20.glDisableVertexAttribArray(positionHandle)

    EGLExt.eglPresentationTimeANDROID(display, eglSurface, ptsUs * 1_000L)
    EGL14.eglSwapBuffers(display, eglSurface)
    return true
  }

  fun release() {
    if (display != EGL14.EGL_NO_DISPLAY) {
      EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
      if (eglSurface != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, eglSurface)
      if (context != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(display, context)
      EGL14.eglReleaseThread()
      EGL14.eglTerminate(display)
    }
    display = EGL14.EGL_NO_DISPLAY
    context = EGL14.EGL_NO_CONTEXT
    eglSurface = EGL14.EGL_NO_SURFACE
    inputSurface.release()
    surfaceTexture.release()
  }

  private fun awaitFrame(): Boolean = synchronized(frameLock) {
    val deadline = System.currentTimeMillis() + FRAME_WAIT_MS
    while (!frameAvailable) {
      val left = deadline - System.currentTimeMillis()
      if (left <= 0) return false
      try {
        frameLock.wait(left)
      } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
        return false
      }
    }
    frameAvailable = false
    true
  }

  private fun setUpEgl(encoderSurface: Surface) {
    display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
    check(display != EGL14.EGL_NO_DISPLAY) { "No EGL display" }
    val version = IntArray(2)
    check(EGL14.eglInitialize(display, version, 0, version, 1)) { "Cannot start EGL" }

    val attributes = intArrayOf(
      EGL14.EGL_RED_SIZE, 8,
      EGL14.EGL_GREEN_SIZE, 8,
      EGL14.EGL_BLUE_SIZE, 8,
      EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
      EGL_RECORDABLE_ANDROID, 1,
      EGL14.EGL_NONE
    )
    val configs = arrayOfNulls<EGLConfig>(1)
    val configCount = IntArray(1)
    check(EGL14.eglChooseConfig(display, attributes, 0, configs, 0, 1, configCount, 0) && configCount[0] > 0) {
      "No EGL configuration for recording"
    }
    val config = configs[0]
    context = EGL14.eglCreateContext(
      display,
      config,
      EGL14.EGL_NO_CONTEXT,
      intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE),
      0
    )
    check(context != EGL14.EGL_NO_CONTEXT) { "Cannot create an EGL context" }
    eglSurface = EGL14.eglCreateWindowSurface(display, config, encoderSurface, intArrayOf(EGL14.EGL_NONE), 0)
    check(eglSurface != EGL14.EGL_NO_SURFACE) { "Cannot draw into the encoder" }
    check(EGL14.eglMakeCurrent(display, eglSurface, eglSurface, context)) { "Cannot use the EGL context" }
  }

  private fun createTexture(): Int {
    val textures = IntArray(1)
    GLES20.glGenTextures(1, textures, 0)
    val id = textures[0]
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, id)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
    return id
  }

  private fun buildProgram(): Int {
    val vertex = compile(GLES20.GL_VERTEX_SHADER, VERTEX_SHADER)
    val fragment = compile(GLES20.GL_FRAGMENT_SHADER, FRAGMENT_SHADER)
    val id = GLES20.glCreateProgram()
    GLES20.glAttachShader(id, vertex)
    GLES20.glAttachShader(id, fragment)
    GLES20.glLinkProgram(id)
    val linked = IntArray(1)
    GLES20.glGetProgramiv(id, GLES20.GL_LINK_STATUS, linked, 0)
    check(linked[0] == GLES20.GL_TRUE) { "Cannot prepare the scaler: ${GLES20.glGetProgramInfoLog(id)}" }
    positionHandle = GLES20.glGetAttribLocation(id, "position")
    textureHandle = GLES20.glGetUniformLocation(id, "texture")
    matrixHandle = GLES20.glGetUniformLocation(id, "textureMatrix")
    GLES20.glDeleteShader(vertex)
    GLES20.glDeleteShader(fragment)
    return id
  }

  private fun compile(type: Int, source: String): Int {
    val shader = GLES20.glCreateShader(type)
    GLES20.glShaderSource(shader, source)
    GLES20.glCompileShader(shader)
    val compiled = IntArray(1)
    GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, compiled, 0)
    check(compiled[0] == GLES20.GL_TRUE) { "Cannot prepare the scaler: ${GLES20.glGetShaderInfoLog(shader)}" }
    return shader
  }

  companion object {
    private const val EGL_RECORDABLE_ANDROID = 0x3142
    private const val STRIDE = 8
    private const val FRAME_WAIT_MS = 2_000L

    // One rectangle covering the whole frame; the texture matrix handles the source's own orientation.
    private val VERTICES = floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)

    private const val VERTEX_SHADER = """
      attribute vec2 position;
      uniform mat4 textureMatrix;
      varying vec2 textureCoordinate;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
        vec2 uv = position * 0.5 + 0.5;
        textureCoordinate = (textureMatrix * vec4(uv, 0.0, 1.0)).xy;
      }
    """

    private const val FRAGMENT_SHADER = """
      #extension GL_OES_EGL_image_external : require
      precision mediump float;
      varying vec2 textureCoordinate;
      uniform samplerExternalOES texture;
      void main() {
        gl_FragColor = texture2D(texture, textureCoordinate);
      }
    """
  }
}
