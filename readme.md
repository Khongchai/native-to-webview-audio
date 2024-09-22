# Native-Webview Audio Processing Protocol

This protocol allows cross-platform playback/multitracking by using files located outside the webview sandbox as the streaming source.

The main idea here is the webview's ability to request chunks when it needed. With vanilla web audio API, we're restricted by its playback time and the stream source must be pre-configured.

```mermaid
 sequenceDiagram
     participant MT as Main Thread
     participant PW as Playback Worklet

     MT->>PW: request:prepare (duration)
     PW->>MT: request:prepared 
     MT->>PW: request:play
     PW->>MT: request:nextChunk (chunkIndex)
     MT->>PW: response:nextChunk (chunks, chunkIndex)
     loop Playback
         PW->>MT: position:report (positionAsSeconds)
         PW->>MT: request:nextChunk (chunkIndex)
         MT->>PW: response:nextChunk (chunks, chunkIndex)
     end
     MT->>PW: request:pause
     PW->>MT: response:paused
     MT->>PW: request:play
     PW->>MT: response:played
     MT->>PW: request:seek (seconds)
     PW->>MT: response:sought
     PW->>MT: request:nextChunk (chunkIndex)
     PW->>MT: position:report (positionAsSeconds)
     MT->>PW: response:nextChunk (chunks, chunkIndex)
     MT->>PW: request:stop
     PW->>MT: response:stopped
     PW->>MT: signal:end
```