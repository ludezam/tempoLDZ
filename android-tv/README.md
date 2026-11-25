# Tempo LDZ para Android TV

Aplicativo em tela cheia para Android TV, projetores e dispositivos com Android 8.0+ (API 26). A WebView abre o site Tempo LDZ e injeta navegação adaptada ao controle remoto.

## Versão 1.6.3

- Pacote: `br.com.ldz.tempotv`
- APK: `Tempo-LDZ.apk` (nome usado pelo TV-LDZ)
- versionCode: 10
- minSdk: 26 · targetSdk: 34
- Assinatura preservada da versão 1.6.2, permitindo atualizar a instalação existente.
- Release: [Tempo LDZ 1.6.3](https://github.com/ludezam/tempoLDZ/releases/tag/v1.6.3)
- Pacote-fonte: [Tempo-LDZ-Android-TV-source-1.6.3.zip](https://github.com/ludezam/tempoLDZ/blob/main/android-tv/Tempo-LDZ-Android-TV-source-1.6.3.zip)

## Alterações desta versão

- Ao pressionar Voltar na tela principal do app, o Android TV abre sua tela inicial, sem diálogo de confirmação.
- Voltar fecha o mapa, as configurações ou a busca de cidade; na página de previsão, retorna ao clima e radar.
- O botão selecionado pelo controle remoto recebe fundo branco e texto azul-marinho para melhor contraste.

O site na raiz do repositório não é alterado pelo build do APK.

## Compilar no Windows

O script `build-apk.ps1` usa o JDK e SDK Android definidos em `tools.local.json` e a chave de assinatura local em `.android`. Esses arquivos locais e a chave privada não fazem parte do pacote-fonte público.

1. Copie `tools.example.json` para `tools.local.json` e ajuste os caminhos do JDK e SDK.
2. Disponibilize localmente a mesma chave usada nas versões anteriores.
3. Execute `./build-apk.ps1` no PowerShell.

O APK produzido aparece em `outputs/Tempo-LDZ.apk`. Para atualizações, mantenha o nome do arquivo, incremente `versionCode` e atualize `versionName` no Gradle e no script de build.

## Versão Android

1.6.3 · versionCode 10 · minSdk 26 · targetSdk 34 · `br.com.ldz.tempotv`.
