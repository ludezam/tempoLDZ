# Tempo LDZ para Android TV

Aplicativo em tela cheia para Android TV, projetores e dispositivos com Android 8.0+ (API 26). A WebView abre o site Tempo LDZ e injeta navegação adaptada ao controle remoto.

## Versão 1.6.4

- Pacote: `br.com.ldz.tempotv`
- APK: `Tempo-LDZ.apk` (nome usado pelo TV-LDZ)
- versionCode: 11
- minSdk: 26 · targetSdk: 34
- Assinatura preservada da versão 1.6.3.
- Release: [Tempo LDZ 1.6.4](https://github.com/ludezam/tempoLDZ/releases/tag/v1.6.4)
- Fonte compactada: [Tempo-LDZ-Android-TV-source-1.6.4.zip](https://github.com/ludezam/tempoLDZ/blob/main/android-tv/Tempo-LDZ-Android-TV-source-1.6.4.zip)

## Alterações

- O radar fica na tela principal e carrega após a localização e os dados do clima; o iframe só é movido para fullscreen quando solicitado.
- O controle remoto percorre os botões principais de cima para baixo: configurações, mapa em tela cheia e atualizar.
- No mapa fullscreen, as setas navegam pelos controles de zoom, recarga e fechamento; o iframe não captura o foco.
- Removido o botão “Controles do radar”.
- Voltar continua fechando o mapa e os painéis antes de retornar à home do Android TV.

O site na raiz do repositório não é alterado pelo build do APK.

## Compilar no Windows

O script `build-apk.ps1` usa o JDK e SDK Android definidos em `tools.local.json` e a chave local em `.android`. Esses arquivos e a chave privada não fazem parte do pacote-fonte público.

1. Copie `tools.example.json` para `tools.local.json` e ajuste os caminhos do JDK e SDK.
2. Disponibilize localmente a mesma chave usada nas versões anteriores.
3. Execute `./build-apk.ps1` no PowerShell.

O APK produzido aparece em `outputs/Tempo-LDZ.apk`. Para atualizações, mantenha o nome, incremente `versionCode` e atualize `versionName` no Gradle e no script de build.

## Versão Android

1.6.4 · versionCode 11 · minSdk 26 · targetSdk 34 · `br.com.ldz.tempotv`.
