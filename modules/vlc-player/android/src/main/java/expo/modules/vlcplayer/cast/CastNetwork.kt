package expo.modules.vlcplayer.cast

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.SocketException

/** Finds the phone's address that a laptop on the same Wi-Fi, or on the phone's own hotspot, can reach. */
internal object CastNetwork {
  enum class Kind(val id: String) { WIFI("wifi"), HOTSPOT("hotspot"), LAN("lan") }

  data class LocalAddress(val ip: String, val kind: Kind)

  // Mobile data, VPN and Wi-Fi Direct interfaces are never reachable from a laptop on the same network.
  private val IGNORED_PREFIXES = listOf("rmnet", "ccmni", "tun", "ppp", "dummy", "p2p", "ipsec", "clat", "v4-")
  // Wi-Fi itself is found through ConnectivityManager first, so a remaining wlan interface is the hotspot.
  private val HOTSPOT_PREFIXES = listOf("ap", "swlan", "softap", "wlan")

  fun localAddress(context: Context): LocalAddress? =
    wifiAddress(context)?.let { LocalAddress(it, Kind.WIFI) } ?: interfaceAddress()

  // allNetworks, not activeNetwork: Wi-Fi without internet is not the active network while mobile data is on.
  @Suppress("DEPRECATION")
  private fun wifiAddress(context: Context): String? {
    val manager = context.getSystemService(ConnectivityManager::class.java) ?: return null
    for (network in manager.allNetworks) {
      val capabilities = manager.getNetworkCapabilities(network) ?: continue
      if (!capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) continue
      val properties = manager.getLinkProperties(network) ?: continue
      properties.linkAddresses
        .map { it.address }
        .firstOrNull { it is Inet4Address && !it.isLoopbackAddress }
        ?.let { return it.hostAddress }
    }
    return null
  }

  private fun interfaceAddress(): LocalAddress? {
    val interfaces = try {
      NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
    } catch (_: SocketException) {
      emptyList()
    }
    var fallback: LocalAddress? = null
    for (networkInterface in interfaces) {
      val name = networkInterface.name.lowercase()
      val usable = try {
        networkInterface.isUp && !networkInterface.isLoopback
      } catch (_: SocketException) {
        false
      }
      if (!usable || IGNORED_PREFIXES.any { name.startsWith(it) }) continue
      val ip = networkInterface.inetAddresses.toList()
        .firstOrNull { it is Inet4Address && it.isSiteLocalAddress }
        ?.hostAddress ?: continue
      if (HOTSPOT_PREFIXES.any { name.startsWith(it) }) return LocalAddress(ip, Kind.HOTSPOT)
      if (fallback == null) fallback = LocalAddress(ip, Kind.LAN)
    }
    return fallback
  }
}
