# Tempo LDZ para Android TV

Aplicativo em tela cheia para Android TV e projetores com Android 8.0+ (API 26+). O app usa uma WebView para abrir o site e injeta navegação por controle remoto, tela de previsão, configurações da cidade e controles do radar.

## Versão publicada

A versão atual é [Tempo LDZ 1.6.2](https://github.com/ludezam/tempoLDZ/releases/tag/v1.6.2). O arquivo instalável se chama **Tempo-LDZ.apk**, nome consumido pelo TV-LDZ. Pacote Android: `br.com.ldz.tempotv`. A versão preserva a assinatura da 1.6.1, permitindo atualização sobre a instalação existente.

O pacote-fonte público está em [`android-tv/`](https://github.com/ludezam/tempoLDZ/tree/main/android-tv) e [`Tempo-LDZ-Android-TV-source-1.6.2.zip`](https://github.com/ludezam/tempoLDZ/blob/main/android-tv/Tempo-LDZ-Android-TV-source-1.6.2.zip). Os arquivos do site na raiz do repositório não são usados pelo build e não precisam ser alterados para atualizar o app.

## O que mudou na 1.6.2

- Foco remoto sem borda nem sombra; o botão muda levemente de fundo.
- O mapa em tela cheia reutiliza o iframe RainViewer já carregado, evitando manter duas instâncias.
- Zoom regional inicial 7, comandos para aproximar/afastar, acessar os controles internos do radar e recarregar manualmente a layer se ela não aparecer.
- A animação não é forçada automaticamente; o usuário pode iniciar o Play pelos controles RainViewer.

## Compilar no Windows

O script `build-apk.ps1` usa o JDK e SDK Android definidos em `tools.local.json` e a chave local dentro de `.android`.

1. Copie `tools.example.json` para `tools.local.json` e ajuste os caminhos locais do JDK e SDK.
2. Preserve a chave de assinatura usada nas versões anteriores. Ela não está no pacote-fonte público.
3. Execute `./build-apk.ps1` no PowerShell.

O APK produzido aparece em `outputs/Tempo-LDZ.apk`. Para atualizações, mantenha o mesmo nome do APK e incremente o `versionCode`.

## Versão Android

1.6.2 · versionCode 9 · minSdk 26 · targetSdk 34 · `br.com.ldz.tempotv`.
